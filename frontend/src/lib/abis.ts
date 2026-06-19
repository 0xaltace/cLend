import { parseAbi } from "viem";

export const MARKET_ABI = parseAbi([
  "function supply(bytes32 encryptedAmount, bytes inputProof)",
  "function withdrawSupply(bytes32 encryptedShares, bytes inputProof)",
  "function addCollateral(bytes32 encryptedAmount, bytes inputProof)",
  "function withdrawCollateral(bytes32 encryptedAmount, bytes inputProof)",
  "function borrow(bytes32 encryptedAmount, bytes inputProof)",
  "function repay(address borrower, bytes32 encryptedAmount, bytes inputProof)",
  "function liquidate(address user, bytes32 encryptedRepayAmount, bytes inputProof)",
  "function requestHealthCheck(address user)",
  "function submitHealthCheck(address user, bytes cleartexts, bytes decryptionProof)",
  "function requestRateSync()",
  "function submitRateSync(bytes cleartexts, bytes decryptionProof)",
  "function accrue()",
  "function positionOf(address user) view returns (bytes32 collat, bytes32 debtNorm, uint64 nonce)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function borrowIndex6() view returns (uint128)",
  "function supplyIndex6() view returns (uint128)",
  "function borrowApr6() view returns (uint64)",
  "function supplyApr6() view returns (uint64)",
  "function lastRateSyncTs() view returns (uint64)",
  "function liquidatableUntil(address user) view returns (uint64)",
  "function lastHealthCheckTs(address user) view returns (uint64)",
  "function symbol() view returns (string)",
  "function marketSnapshot() view returns (uint64 cash, uint64 borrows, uint64 collateral, uint64 utilization6, uint64 syncedAt)",
  "function lastSyncTimestamp() view returns (uint64)",
  "function lastSyncUtilization6() view returns (uint64)",
  "function SYNC_BASED_SUPPLY_CAP() view returns (uint64)",
  "function SYNC_BASED_BORROW_CAP() view returns (uint64)",
  "function MAX_SYNC_AGE() view returns (uint64)",
  "function RATE_SYNC_INTERVAL() view returns (uint64)",
  "function COLLATERAL_TOKEN() view returns (address)",
  "function DEBT_TOKEN() view returns (address)",
  "event HealthCheckRequested(address indexed user, bytes32 flagHandle, uint64 nonce)",
  "event HealthCheckResolved(address indexed user, bool liquidatable)",
  "event RateSyncRequested(bytes32 cashHandle, bytes32 borrowsNormHandle, bytes32 collateralHandle)",
  "event RatesUpdated(uint64 utilization6, uint64 borrowApr6, uint64 supplyApr6, uint64 cash, uint64 totalBorrows)",
  "event Liquidated(address indexed user, address indexed liquidator)",
  "event Supplied(address indexed user)",
  "event Borrowed(address indexed user)",
  "event Repaid(address indexed payer, address indexed borrower)",
  "event CollateralAdded(address indexed user)",
  "event CollateralWithdrawn(address indexed user)",
  "event SupplyWithdrawn(address indexed user)",
]);

export const FACTORY_ABI = parseAbi([
  "function createMarket(address collateralToken, address debtToken) returns (address)",
  "function marketFor(address collat, address debt) view returns (address)",
  "function allMarkets() view returns (address[])",
  "event MarketCreated(address indexed market, address indexed collateralToken, address indexed debtToken, address creator)",
]);

export const ORACLE_ABI = parseAbi([
  "function priceUsd8(address asset) view returns (uint256)",
  "function hasFeed(address asset) view returns (bool)",
  "function feedOf(address asset) view returns (address feed, uint32 staleTtl)",
]);

export const REGISTRY_ABI = parseAbi([
  "function getTokenConfidentialTokenPairsLength() view returns (uint256)",
  "function isConfidentialTokenValid(address confidentialToken) view returns (bool)",
  "function getTokenAddress(address confidentialTokenAddress) view returns (bool, address)",
]);

export const WRAPPER_ABI = parseAbi([
  "function wrap(address to, uint256 amount)",
  "function unwrap(address from, address to, bytes32 encryptedAmount, bytes inputProof) returns (bytes32)",
  "function finalizeUnwrap(bytes32 unwrapRequestId, uint64 unwrapAmountCleartext, bytes decryptionProof)",
  "function underlying() view returns (address)",
  "function rate() view returns (uint256)",
  "function confidentialBalanceOf(address account) view returns (bytes32)",
  "function isOperator(address holder, address spender) view returns (bool)",
  "function setOperator(address operator, uint48 until)",
  "function symbol() view returns (string)",
  "event UnwrapRequested(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 amount)",
]);

export const MINTABLE_ERC20_ABI = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
