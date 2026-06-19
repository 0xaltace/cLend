// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, externalEuint64, euint64, euint128, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ClendPriceOracle} from "./ClendPriceOracle.sol";

/// @title cLend Market — a fully encrypted, isolated lending market
/// @notice One collateral asset, one debt asset, both ERC-7984 confidential tokens
///         from the official Zama Confidential Wrappers Registry.
///
///         Privacy model (what stays encrypted, forever):
///           - every supplier balance (ERC-7984 share token)
///           - every borrower's collateral and debt
///           - every health factor — solvency is checked under FHE
///         The ONLY values ever disclosed:
///           - a per-position boolean "liquidatable: yes/no", produced on demand via
///             the public-decryption flow (one bit per check, rate-limited)
///           - pool aggregates (total cash, total borrows) at rate-sync snapshots,
///             which drive the algorithmic interest rate model
///
///         Interest accounting uses normalized debt: a position stores
///         debtNorm = sum(borrowed * 1e6 / borrowIndex6 at borrow time), so current
///         debt = debtNorm * borrowIndex6 / 1e6. Indexes accrue in plaintext — the
///         hot paths spend FHE ops only on scalar mul/div, never ciphertext-by-
///         ciphertext arithmetic.
contract ClendMarket is ERC7984, ZamaEthereumConfig, ReentrancyGuard {
    // ---------------------------------------------------------------- types

    struct Position {
        euint64 collat; // encrypted collateral balance (token units, 1e6)
        euint64 debtNorm; // encrypted normalized debt principal (1e6-index units)
        uint64 nonce; // bumped on every position change; invalidates health checks
    }

    struct HealthCheck {
        ebool flag; // encrypted "is liquidatable" made publicly decryptable
        uint64 nonce; // position nonce the check was computed against
        uint64 requestedAt;
    }

    struct RateSync {
        euint64 cash; // snapshot handle of pool debt-asset balance
        euint64 borrowsNorm; // snapshot handle of total normalized borrows
        euint64 collateralBal; // snapshot handle of pool collateral-asset balance
        uint128 borrowIndexAtRequest6;
        bool pending;
    }

    // ----------------------------------------------------------- immutables

    IERC7984 public immutable COLLATERAL_TOKEN;
    IERC7984 public immutable DEBT_TOKEN;
    ClendPriceOracle public immutable ORACLE;

    /// @dev Risk parameters, 1e6 scale unless noted. LTV < LLTV gives borrowers a buffer.
    uint64 public constant LTV6 = 750_000; // 75% max borrow power
    uint64 public constant LLTV6 = 800_000; // 80% liquidation threshold
    uint64 public constant LIQ_BONUS_BPS = 500; // 5% liquidator bonus
    uint64 public constant CLOSE_FACTOR_BPS = 5_000; // max 50% of debt per liquidation

    /// @dev Kinked interest rate model (annual rates, 1e6 scale).
    uint64 public constant KINK6 = 800_000; // 80% target utilization
    uint64 public constant BASE_RATE6 = 0;
    uint64 public constant SLOPE1_6 = 40_000; // +4% APR from 0 -> kink
    uint64 public constant SLOPE2_6 = 600_000; // +60% APR from kink -> 100%
    uint64 public constant RESERVE_BPS = 1_000; // 10% of borrow interest to reserves

    uint64 public constant HEALTH_CHECK_COOLDOWN = 60; // seconds between checks per position
    uint64 public constant LIQ_FLAG_WINDOW = 600; // flag validity after confirmation
    uint64 public constant RATE_SYNC_INTERVAL = 300; // min seconds between rate syncs

    /// @notice Sync-based exposure gates: checked against the LAST DISCLOSED totals,
    ///         so they lag up to one sync and can be overshot within a stale window.
    ///         Exposure-warning gates, not hard invariants (see SECURITY.md).
    uint64 public immutable SYNC_BASED_SUPPLY_CAP; // debt-asset units (1e6)
    uint64 public immutable SYNC_BASED_BORROW_CAP; // debt-asset units (1e6)
    /// @notice Supply/borrow refuse to run on aggregates older than this. Rate sync is
    ///         permissionless, so anyone can unbrick; exits never depend on it.
    uint64 public constant MAX_SYNC_AGE = 24 hours;

    uint256 private constant SECONDS_PER_YEAR = 365 days;
    uint256 private constant WAD6 = 1_000_000;

    // ---------------------------------------------------------------- state

    uint128 public borrowIndex6 = 1_000_000;
    uint128 public supplyIndex6 = 1_000_000;
    uint64 public borrowApr6;
    uint64 public supplyApr6;
    uint64 public lastAccrualTs;
    uint64 public lastRateSyncTs;

    /// @notice Cleartext aggregates stored at each completed rate sync ("as of last
    ///         sync"). Live views over encrypted totals are impossible; these are the
    ///         queryable public snapshot powering TVL, caps and keeper tooling.
    uint64 public lastSyncCash;
    uint64 public lastSyncBorrows;
    uint64 public lastSyncCollateral;
    uint64 public lastSyncUtilization6;
    uint64 public lastSyncTimestamp;

    euint64 private _totalBorrowsNorm;

    mapping(address user => Position) private _positions;
    mapping(address user => HealthCheck) private _healthChecks;
    mapping(address user => uint64) public lastHealthCheckTs;
    /// @notice user => timestamp until which the position is liquidatable (0 = not flagged)
    mapping(address user => uint64) public liquidatableUntil;
    mapping(address user => uint64) private _liquidatableNonce;

    RateSync private _rateSync;

    // --------------------------------------------------------------- events

    event Supplied(address indexed user);
    event SupplyWithdrawn(address indexed user);
    event CollateralAdded(address indexed user);
    event CollateralWithdrawn(address indexed user);
    event Borrowed(address indexed user);
    event Repaid(address indexed payer, address indexed borrower);
    event HealthCheckRequested(address indexed user, bytes32 flagHandle, uint64 nonce);
    event HealthCheckResolved(address indexed user, bool liquidatable);
    event Liquidated(address indexed user, address indexed liquidator);
    event RateSyncRequested(bytes32 cashHandle, bytes32 borrowsNormHandle, bytes32 collateralHandle);
    event RatesUpdated(uint64 utilization6, uint64 borrowApr6, uint64 supplyApr6, uint64 cash, uint64 totalBorrows);
    event Accrued(uint128 borrowIndex6, uint128 supplyIndex6);

    // --------------------------------------------------------------- errors

    error OperatorNotSet(address token);
    error SyncStale(uint64 lastSyncTimestamp);
    error SupplyCapReached(uint64 lastSyncedTotal);
    error BorrowCapReached(uint64 lastSyncedBorrows);
    error HealthCheckTooSoon();
    error HealthCheckMismatch();
    error NoPendingHealthCheck();
    error NotLiquidatable(address user);
    error RateSyncTooSoon();
    error NoPendingRateSync();
    error UnsupportedTokenDecimals(address token);

    constructor(
        address collateralToken_,
        address debtToken_,
        address oracle_,
        uint64 supplyCap_,
        uint64 borrowCap_,
        string memory shareName_,
        string memory shareSymbol_
    ) ERC7984(shareName_, shareSymbol_, "") {
        require(IERC7984(collateralToken_).decimals() == 6, UnsupportedTokenDecimals(collateralToken_));
        require(IERC7984(debtToken_).decimals() == 6, UnsupportedTokenDecimals(debtToken_));

        COLLATERAL_TOKEN = IERC7984(collateralToken_);
        DEBT_TOKEN = IERC7984(debtToken_);
        ORACLE = ClendPriceOracle(oracle_);
        SYNC_BASED_SUPPLY_CAP = supplyCap_;
        SYNC_BASED_BORROW_CAP = borrowCap_;
        lastAccrualTs = uint64(block.timestamp);

        _totalBorrowsNorm = FHE.asEuint64(0);
        FHE.allowThis(_totalBorrowsNorm);
    }

    /// @dev Exposure gate for supply/borrow: refuses stale aggregates and enforces the
    ///      sync-based caps. Skipped entirely before the first sync (bootstrap: all
    ///      disclosed totals are zero, so there is nothing to gate).
    function _checkSyncGate(bool isBorrow) internal view {
        if (lastSyncTimestamp == 0) return;
        require(uint64(block.timestamp) - lastSyncTimestamp <= MAX_SYNC_AGE, SyncStale(lastSyncTimestamp));
        if (isBorrow) {
            require(lastSyncBorrows < SYNC_BASED_BORROW_CAP, BorrowCapReached(lastSyncBorrows));
        } else {
            uint64 total = lastSyncCash + lastSyncBorrows;
            require(total < SYNC_BASED_SUPPLY_CAP, SupplyCapReached(total));
        }
    }

    // ------------------------------------------------------ interest accrual

    /// @notice Accrues both indexes in plaintext. Costs zero FHE operations.
    function accrue() public {
        uint64 nowTs = uint64(block.timestamp);
        uint64 dt = nowTs - lastAccrualTs;
        if (dt == 0) return;
        borrowIndex6 = _accrued(borrowIndex6, borrowApr6, dt);
        supplyIndex6 = _accrued(supplyIndex6, supplyApr6, dt);
        lastAccrualTs = nowTs;
        emit Accrued(borrowIndex6, supplyIndex6);
    }

    function _accrued(uint128 index6, uint64 apr6, uint64 dt) internal pure returns (uint128) {
        uint256 grown = (uint256(index6) * apr6 * dt) / (WAD6 * SECONDS_PER_YEAR);
        return index6 + uint128(grown);
    }

    // ------------------------------------------------------------ supply side

    /// @notice Supply the debt asset to the pool; receive encrypted interest-bearing shares.
    /// @dev Caller must first call `setOperator(market, until)` on the debt token.
    function supply(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant {
        require(DEBT_TOKEN.isOperator(msg.sender, address(this)), OperatorNotSet(address(DEBT_TOKEN)));
        _checkSyncGate(false);
        accrue();

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowTransient(amount, address(DEBT_TOKEN));
        euint64 received = DEBT_TOKEN.confidentialTransferFrom(msg.sender, address(this), amount);

        // shares = received * 1e6 / supplyIndex6 (floor — rounding favors the pool)
        euint64 shares = FHE.asEuint64(FHE.div(FHE.mul(FHE.asEuint128(received), uint128(WAD6)), supplyIndex6));
        _mint(msg.sender, shares);

        emit Supplied(msg.sender);
    }

    /// @notice Redeem shares for the underlying debt asset, clamped to available pool cash.
    function withdrawSupply(externalEuint64 encryptedShares, bytes calldata inputProof) external nonReentrant {
        accrue();

        euint64 requested = FHE.fromExternal(encryptedShares, inputProof);

        // Cap redeemable shares by pool cash so share burn and payout stay consistent.
        euint64 cash = DEBT_TOKEN.confidentialBalanceOf(address(this));
        euint64 maxShares = FHE.asEuint64(FHE.div(FHE.mul(FHE.asEuint128(cash), uint128(WAD6)), supplyIndex6));
        euint64 redeemable = FHE.select(FHE.lt(requested, maxShares), requested, maxShares);

        // Burn is all-or-nothing against the caller's share balance; `burned` is the
        // amount actually burned (0 when the caller asked for more than they hold).
        euint64 burned = _burn(msg.sender, redeemable);

        euint64 payout = FHE.asEuint64(FHE.div(FHE.mul(FHE.asEuint128(burned), supplyIndex6), uint128(WAD6)));
        FHE.allowTransient(payout, address(DEBT_TOKEN));
        DEBT_TOKEN.confidentialTransfer(msg.sender, payout);

        emit SupplyWithdrawn(msg.sender);
    }

    // --------------------------------------------------------- borrower side

    /// @notice Deposit collateral. Caller must have set this market as operator on the
    ///         collateral token.
    function addCollateral(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant {
        require(COLLATERAL_TOKEN.isOperator(msg.sender, address(this)), OperatorNotSet(address(COLLATERAL_TOKEN)));
        accrue();

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allowTransient(amount, address(COLLATERAL_TOKEN));
        euint64 received = COLLATERAL_TOKEN.confidentialTransferFrom(msg.sender, address(this), amount);

        Position storage pos = _positions[msg.sender];
        _initPosition(pos, msg.sender);
        pos.collat = FHE.add(pos.collat, received);
        _persistPosition(pos, msg.sender);

        emit CollateralAdded(msg.sender);
    }

    /// @notice Withdraw collateral, clamped under FHE so the position stays at or under
    ///         the borrow LTV. An over-ask withdraws the maximum safe amount instead of
    ///         reverting (a revert would leak position information).
    function withdrawCollateral(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant {
        accrue();
        (uint256 pc8, uint256 pd8) = ORACLE.quote(address(COLLATERAL_TOKEN), address(DEBT_TOKEN));

        Position storage pos = _positions[msg.sender];
        _initPosition(pos, msg.sender);

        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);

        // requiredCollat = ceil(debtNorm * pd8 * borrowIndex6 / (pc8 * LTV6))  [collateral units]
        uint256 debtScalar = pd8 * borrowIndex6; // <= 1e8*~1e6 -> fits easily
        uint256 collatDivisor = pc8 * LTV6;
        euint128 debtSide = FHE.mul(FHE.asEuint128(pos.debtNorm), uint128(debtScalar));
        euint128 required128 = FHE.div(FHE.add(debtSide, uint128(collatDivisor - 1)), uint128(collatDivisor));
        euint64 required = FHE.asEuint64(required128);

        ebool hasExcess = FHE.gt(pos.collat, required);
        euint64 maxWithdraw = FHE.select(hasExcess, FHE.sub(pos.collat, required), FHE.asEuint64(0));
        euint64 amount = FHE.select(FHE.lt(requested, maxWithdraw), requested, maxWithdraw);

        pos.collat = FHE.sub(pos.collat, amount);
        _persistPosition(pos, msg.sender);

        FHE.allowTransient(amount, address(COLLATERAL_TOKEN));
        COLLATERAL_TOKEN.confidentialTransfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender);
    }

    /// @notice Borrow the debt asset against deposited collateral. The requested amount
    ///         is clamped under FHE to the position's remaining borrow power — an
    ///         over-ask receives the maximum, leaking nothing.
    function borrow(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant {
        _checkSyncGate(true);
        accrue();
        (uint256 pc8, uint256 pd8) = ORACLE.quote(address(COLLATERAL_TOKEN), address(DEBT_TOKEN));

        Position storage pos = _positions[msg.sender];
        _initPosition(pos, msg.sender);

        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);

        // headroomValue = collat*pc8*LTV6 - debtNorm*pd8*borrowIndex6   [1e20 value scale]
        euint128 collatSide = FHE.mul(FHE.asEuint128(pos.collat), uint128(pc8 * LTV6));
        euint128 debtSide = FHE.mul(FHE.asEuint128(pos.debtNorm), uint128(pd8 * borrowIndex6));
        ebool solventForMore = FHE.gt(collatSide, debtSide);
        euint128 headroomValue = FHE.select(solventForMore, FHE.sub(collatSide, debtSide), FHE.asEuint128(0));

        // maxBorrow = headroomValue / (pd8 * 1e6)   [debt token units]
        euint128 maxBorrow128 = FHE.div(headroomValue, uint128(pd8 * WAD6));
        euint128 requested128 = FHE.asEuint128(requested);
        euint64 powerClamped = FHE.asEuint64(
            FHE.select(FHE.lt(requested128, maxBorrow128), requested128, maxBorrow128)
        );

        // Triple clamp: also bound by pool cash so a shallow pool gives a PARTIAL
        // fill instead of the all-or-nothing zero transfer.
        euint64 poolCash = DEBT_TOKEN.confidentialBalanceOf(address(this));
        euint64 amount = FHE.select(FHE.lt(powerClamped, poolCash), powerClamped, poolCash);

        // amount <= poolCash is guaranteed within this tx (nonReentrant, no balance
        // change between the read and the transfer), so the ERC-7984 all-or-nothing
        // clamp can never fire: the transfer sends exactly `amount`. Accounting
        // therefore uses `amount` directly, keeping the debt-norm math OFF the
        // transfer's FHE dependency chain (HCU sequential-depth headroom).
        FHE.allowTransient(amount, address(DEBT_TOKEN));
        DEBT_TOKEN.confidentialTransfer(msg.sender, amount);

        // debtNorm += ceil(amount * 1e6 / borrowIndex6) — rounding always against borrower
        euint64 borrowedNorm = FHE.asEuint64(
            FHE.div(
                FHE.add(FHE.mul(FHE.asEuint128(amount), uint128(WAD6)), uint128(borrowIndex6) - 1),
                borrowIndex6
            )
        );
        pos.debtNorm = FHE.add(pos.debtNorm, borrowedNorm);
        _persistPosition(pos, msg.sender);

        _totalBorrowsNorm = FHE.add(_totalBorrowsNorm, borrowedNorm);
        FHE.allowThis(_totalBorrowsNorm);

        emit Borrowed(msg.sender);
    }

    /// @notice Repay a borrower's debt (anyone can repay for anyone). Overpayment is
    ///         clamped under FHE to the outstanding debt.
    function repay(
        address borrower,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external nonReentrant {
        require(DEBT_TOKEN.isOperator(msg.sender, address(this)), OperatorNotSet(address(DEBT_TOKEN)));
        accrue();

        Position storage pos = _positions[borrower];
        _initPosition(pos, borrower);

        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);

        // currentDebt = debtNorm * borrowIndex6 / 1e6 (ceil, so full repays never round short)
        euint64 currentDebt = FHE.asEuint64(
            FHE.div(
                FHE.add(FHE.mul(FHE.asEuint128(pos.debtNorm), borrowIndex6), uint128(WAD6) - 1),
                uint128(WAD6)
            )
        );
        euint64 amount = FHE.select(FHE.lt(requested, currentDebt), requested, currentDebt);

        FHE.allowTransient(amount, address(DEBT_TOKEN));
        euint64 received = DEBT_TOKEN.confidentialTransferFrom(msg.sender, address(this), amount);

        _reduceDebt(pos, received);
        _persistPosition(pos, borrower);

        emit Repaid(msg.sender, borrower);
    }

    // ------------------------------------------------------ health + liquidation

    /// @notice Anyone may request a solvency check on a position. The check compares
    ///         encrypted values and discloses exactly ONE bit: liquidatable or not.
    function requestHealthCheck(address user) external {
        require(uint64(block.timestamp) >= lastHealthCheckTs[user] + HEALTH_CHECK_COOLDOWN, HealthCheckTooSoon());
        accrue();
        (uint256 pc8, uint256 pd8) = ORACLE.quote(address(COLLATERAL_TOKEN), address(DEBT_TOKEN));

        Position storage pos = _positions[user];
        _initPosition(pos, user);

        // liquidatable <=> collat*pc8*LLTV6 < debtNorm*pd8*borrowIndex6
        euint128 collatSide = FHE.mul(FHE.asEuint128(pos.collat), uint128(pc8 * LLTV6));
        euint128 debtSide = FHE.mul(FHE.asEuint128(pos.debtNorm), uint128(pd8 * borrowIndex6));
        ebool flag = FHE.lt(collatSide, debtSide);
        FHE.makePubliclyDecryptable(flag);

        _healthChecks[user] = HealthCheck({flag: flag, nonce: pos.nonce, requestedAt: uint64(block.timestamp)});
        lastHealthCheckTs[user] = uint64(block.timestamp);

        emit HealthCheckRequested(user, ebool.unwrap(flag), pos.nonce);
    }

    /// @notice Finalize a health check with the KMS decryption proof obtained off-chain
    ///         via the relayer's publicDecrypt. A confirmed `true` arms liquidation for
    ///         LIQ_FLAG_WINDOW seconds, unless the position changed in the meantime.
    function submitHealthCheck(address user, bytes calldata cleartexts, bytes calldata decryptionProof) external {
        HealthCheck storage hc = _healthChecks[user];
        require(FHE.isInitialized(hc.flag), NoPendingHealthCheck());
        require(hc.nonce == _positions[user].nonce, HealthCheckMismatch());

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = ebool.unwrap(hc.flag);
        FHE.checkSignatures(handles, cleartexts, decryptionProof);

        bool liquidatable = abi.decode(cleartexts, (bool));
        if (liquidatable) {
            liquidatableUntil[user] = uint64(block.timestamp) + LIQ_FLAG_WINDOW;
            _liquidatableNonce[user] = hc.nonce;
        } else {
            liquidatableUntil[user] = 0;
        }
        delete _healthChecks[user];

        emit HealthCheckResolved(user, liquidatable);
    }

    /// @notice Liquidate a flagged position. Repay is clamped to CLOSE_FACTOR of current
    ///         debt; seized collateral = repaid value * (1 + bonus), clamped to the
    ///         position's collateral. Seized amount transfers in the same transaction.
    function liquidate(
        address user,
        externalEuint64 encryptedRepayAmount,
        bytes calldata inputProof
    ) external nonReentrant {
        require(
            liquidatableUntil[user] >= uint64(block.timestamp) &&
                _liquidatableNonce[user] == _positions[user].nonce,
            NotLiquidatable(user)
        );
        require(DEBT_TOKEN.isOperator(msg.sender, address(this)), OperatorNotSet(address(DEBT_TOKEN)));
        accrue();
        (uint256 pc8, uint256 pd8) = ORACLE.quote(address(COLLATERAL_TOKEN), address(DEBT_TOKEN));

        Position storage pos = _positions[user];

        euint64 requested = FHE.fromExternal(encryptedRepayAmount, inputProof);

        // maxRepay = debtNorm * borrowIndex6 * CLOSE_FACTOR / (1e6 * 10000)
        euint64 maxRepay = FHE.asEuint64(
            FHE.div(
                FHE.mul(FHE.asEuint128(pos.debtNorm), uint128(uint256(borrowIndex6) * CLOSE_FACTOR_BPS)),
                uint128(WAD6 * 10_000)
            )
        );
        euint64 repayAmount = FHE.select(FHE.lt(requested, maxRepay), requested, maxRepay);

        FHE.allowTransient(repayAmount, address(DEBT_TOKEN));
        euint64 received = DEBT_TOKEN.confidentialTransferFrom(msg.sender, address(this), repayAmount);

        _reduceDebt(pos, received);

        // seize = received * pd8 * (10000 + bonus) / (pc8 * 10000)   [collateral units]
        euint128 seizeNum = FHE.mul(FHE.asEuint128(received), uint128(pd8 * (10_000 + LIQ_BONUS_BPS)));
        euint64 seize = FHE.asEuint64(FHE.div(seizeNum, uint128(pc8 * 10_000)));
        ebool overCollat = FHE.gt(seize, pos.collat);
        euint64 seized = FHE.select(overCollat, pos.collat, seize);

        pos.collat = FHE.sub(pos.collat, seized);
        _persistPosition(pos, user);

        liquidatableUntil[user] = 0;

        FHE.allowTransient(seized, address(COLLATERAL_TOKEN));
        COLLATERAL_TOKEN.confidentialTransfer(msg.sender, seized);

        emit Liquidated(user, msg.sender);
    }

    // ------------------------------------------------------------- rate sync

    /// @notice Snapshot pool aggregates and mark them publicly decryptable. Anyone can
    ///         run this (our keeper does); rates update in `submitRateSync`.
    function requestRateSync() external {
        require(uint64(block.timestamp) >= lastRateSyncTs + RATE_SYNC_INTERVAL, RateSyncTooSoon());
        accrue();

        euint64 cash = DEBT_TOKEN.confidentialBalanceOf(address(this));
        euint64 collateralBal = COLLATERAL_TOKEN.confidentialBalanceOf(address(this));
        // Balances the market never received are uninitialized zero-handles, which
        // the KMS refuses to decrypt — substitute a real encrypted zero.
        if (!FHE.isInitialized(cash)) cash = FHE.asEuint64(0);
        if (!FHE.isInitialized(collateralBal)) collateralBal = FHE.asEuint64(0);
        FHE.makePubliclyDecryptable(cash);
        FHE.makePubliclyDecryptable(_totalBorrowsNorm);
        FHE.makePubliclyDecryptable(collateralBal);

        _rateSync = RateSync({
            cash: cash,
            borrowsNorm: _totalBorrowsNorm,
            collateralBal: collateralBal,
            borrowIndexAtRequest6: borrowIndex6,
            pending: true
        });
        lastRateSyncTs = uint64(block.timestamp);

        emit RateSyncRequested(
            euint64.unwrap(cash),
            euint64.unwrap(_totalBorrowsNorm),
            euint64.unwrap(collateralBal)
        );
    }

    /// @notice Finalize a rate sync with the KMS proof. Computes utilization and applies
    ///         the kinked rate curve. Aggregates (cash, total borrows) become public at
    ///         each sync by design; individual positions never do.
    function submitRateSync(bytes calldata cleartexts, bytes calldata decryptionProof) external {
        RateSync storage rs = _rateSync;
        require(rs.pending, NoPendingRateSync());

        bytes32[] memory handles = new bytes32[](3);
        handles[0] = euint64.unwrap(rs.cash);
        handles[1] = euint64.unwrap(rs.borrowsNorm);
        handles[2] = euint64.unwrap(rs.collateralBal);
        FHE.checkSignatures(handles, cleartexts, decryptionProof);

        (uint64 cashClear, uint64 borrowsNormClear, uint64 collateralClear) = abi.decode(
            cleartexts,
            (uint64, uint64, uint64)
        );
        uint256 totalBorrows = (uint256(borrowsNormClear) * rs.borrowIndexAtRequest6) / WAD6;

        accrue();

        uint64 utilization6 = 0;
        uint256 total = uint256(cashClear) + totalBorrows;
        if (total > 0) {
            utilization6 = uint64((totalBorrows * WAD6) / total);
        }

        uint64 newBorrowApr6 = _borrowRate6(utilization6);
        // supply APR = borrow APR * U * (1 - reserve factor)
        uint64 newSupplyApr6 = uint64(
            (uint256(newBorrowApr6) * utilization6 * (10_000 - RESERVE_BPS)) / (WAD6 * 10_000)
        );

        borrowApr6 = newBorrowApr6;
        supplyApr6 = newSupplyApr6;

        // Public snapshot: powers TVL views, sync-based caps and keeper tooling.
        lastSyncCash = cashClear;
        lastSyncBorrows = uint64(totalBorrows);
        lastSyncCollateral = collateralClear;
        lastSyncUtilization6 = utilization6;
        lastSyncTimestamp = uint64(block.timestamp);
        rs.pending = false;

        emit RatesUpdated(utilization6, newBorrowApr6, newSupplyApr6, cashClear, uint64(totalBorrows));
    }

    /// @notice Aggregates as of the last completed sync, for frontends and keepers.
    function marketSnapshot()
        external
        view
        returns (uint64 cash, uint64 borrows, uint64 collateral, uint64 utilization6, uint64 syncedAt)
    {
        return (lastSyncCash, lastSyncBorrows, lastSyncCollateral, lastSyncUtilization6, lastSyncTimestamp);
    }

    /// @notice Kinked rate curve: gentle up to the kink, steep beyond it.
    function _borrowRate6(uint64 utilization6) internal pure returns (uint64) {
        if (utilization6 <= KINK6) {
            return BASE_RATE6 + uint64((uint256(SLOPE1_6) * utilization6) / KINK6);
        }
        return
            BASE_RATE6 +
            SLOPE1_6 +
            uint64((uint256(SLOPE2_6) * (utilization6 - KINK6)) / (WAD6 - KINK6));
    }

    // ------------------------------------------------------------- view/helpers

    /// @notice Encrypted position handles, decryptable only by the position owner via
    ///         the EIP-712 user-decryption flow.
    function positionOf(address user) external view returns (euint64 collat, euint64 debtNorm, uint64 nonce) {
        Position storage pos = _positions[user];
        return (pos.collat, pos.debtNorm, pos.nonce);
    }

    /// @notice Current debt multiplier; frontend computes debt = debtNorm * this / 1e6.
    function currentBorrowIndex6() external view returns (uint128) {
        return borrowIndex6;
    }

    // ------------------------------------------------------------- internals

    function _initPosition(Position storage pos, address user) internal {
        if (!FHE.isInitialized(pos.collat)) {
            pos.collat = FHE.asEuint64(0);
            FHE.allowThis(pos.collat);
            FHE.allow(pos.collat, user);
        }
        if (!FHE.isInitialized(pos.debtNorm)) {
            pos.debtNorm = FHE.asEuint64(0);
            FHE.allowThis(pos.debtNorm);
            FHE.allow(pos.debtNorm, user);
        }
    }

    /// @dev Re-grant ACL on updated position handles and invalidate stale health flags.
    function _persistPosition(Position storage pos, address user) internal {
        FHE.allowThis(pos.collat);
        FHE.allow(pos.collat, user);
        FHE.allowThis(pos.debtNorm);
        FHE.allow(pos.debtNorm, user);
        pos.nonce += 1;
    }

    /// @dev Reduce a position's normalized debt by a just-received repay amount and
    ///      mirror the reduction on the pool total. Floor rounding on the norm keeps
    ///      residual dust owed by the borrower, never by the pool.
    function _reduceDebt(Position storage pos, euint64 received) internal {
        euint64 repaidNorm = FHE.asEuint64(
            FHE.div(FHE.mul(FHE.asEuint128(received), uint128(WAD6)), borrowIndex6)
        );
        ebool overNorm = FHE.gt(repaidNorm, pos.debtNorm);
        euint64 reducedNorm = FHE.select(overNorm, pos.debtNorm, repaidNorm);

        pos.debtNorm = FHE.sub(pos.debtNorm, reducedNorm);

        ebool overTotal = FHE.gt(reducedNorm, _totalBorrowsNorm);
        euint64 totalReduction = FHE.select(overTotal, _totalBorrowsNorm, reducedNorm);
        _totalBorrowsNorm = FHE.sub(_totalBorrowsNorm, totalReduction);
        FHE.allowThis(_totalBorrowsNorm);
    }
}
