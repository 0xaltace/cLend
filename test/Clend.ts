import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";

import type {
  ClendFactory,
  ClendMarket,
  ClendPriceOracle,
  MockConfidentialTokensRegistry,
  PostedPriceFeed,
  TestConfidentialToken,
} from "../types";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const WAD6 = 1_000_000n;
const HOUR = 3_600;
const OPERATOR_TTL = 4_000_000_000; // far-future operator expiry for tests

const USD = (n: number | bigint) => BigInt(n) * WAD6; // 6-decimal token units
const P8 = (n: number | bigint) => BigInt(n) * 10n ** 8n; // 8-decimal USD price

describe("cLend", function () {
  let deployer: HardhatEthersSigner;
  let lender: HardhatEthersSigner;
  let borrower: HardhatEthersSigner;
  let liquidator: HardhatEthersSigner;

  let cWETH: TestConfidentialToken;
  let cUSDC: TestConfidentialToken;
  let feedWETH: PostedPriceFeed;
  let feedUSDC: PostedPriceFeed;
  let oracle: ClendPriceOracle;
  let registry: MockConfidentialTokensRegistry;
  let factory: ClendFactory;
  let market: ClendMarket;

  async function deployStack() {
    [deployer, lender, borrower, liquidator] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("TestConfidentialToken");
    cWETH = await Token.deploy("Confidential WETH", "cWETH");
    cUSDC = await Token.deploy("Confidential USDC", "cUSDC");

    const Feed = await ethers.getContractFactory("PostedPriceFeed");
    feedWETH = await Feed.deploy(deployer.address, "WETH / USD (posted)", P8(3000));
    feedUSDC = await Feed.deploy(deployer.address, "USDC / USD (posted)", P8(1));

    const Oracle = await ethers.getContractFactory("ClendPriceOracle");
    oracle = await Oracle.deploy(deployer.address);
    await oracle.setFeed(await cWETH.getAddress(), await feedWETH.getAddress(), 7 * 24 * HOUR);
    await oracle.setFeed(await cUSDC.getAddress(), await feedUSDC.getAddress(), 7 * 24 * HOUR);

    const Registry = await ethers.getContractFactory("MockConfidentialTokensRegistry");
    registry = await Registry.deploy();
    await registry.setPair(ethers.Wallet.createRandom().address, await cWETH.getAddress(), true);
    await registry.setPair(ethers.Wallet.createRandom().address, await cUSDC.getAddress(), true);

    const Factory = await ethers.getContractFactory("ClendFactory");
    factory = await Factory.deploy(await registry.getAddress(), await oracle.getAddress());

    await factory.createMarket(await cWETH.getAddress(), await cUSDC.getAddress());
    const marketAddr = await factory.marketFor(await cWETH.getAddress(), await cUSDC.getAddress());
    market = await ethers.getContractAt("ClendMarket", marketAddr);

    // Fund actors and approve the market as operator where needed.
    await cUSDC.mint(lender.address, USD(100_000));
    await cWETH.mint(borrower.address, USD(10)); // 10 WETH
    await cUSDC.mint(liquidator.address, USD(50_000));

    await cUSDC.connect(lender).setOperator(marketAddr, OPERATOR_TTL);
    await cWETH.connect(borrower).setOperator(marketAddr, OPERATOR_TTL);
    await cUSDC.connect(borrower).setOperator(marketAddr, OPERATOR_TTL);
    await cUSDC.connect(liquidator).setOperator(marketAddr, OPERATOR_TTL);
  }

  async function encrypt(amount: bigint, contract: string, user: HardhatEthersSigner) {
    const input = fhevm.createEncryptedInput(contract, user.address);
    input.add64(amount);
    return input.encrypt();
  }

  async function decryptBalance(token: TestConfidentialToken | ClendMarket, user: HardhatEthersSigner) {
    const handle = await token.confidentialBalanceOf(user.address);
    if (handle === ethers.ZeroHash) return 0n;
    return fhevm.userDecryptEuint(FhevmType.euint64, handle, await token.getAddress(), user);
  }

  async function decryptPosition(user: HardhatEthersSigner) {
    const [collatHandle, debtNormHandle] = await market.positionOf(user.address);
    const marketAddr = await market.getAddress();
    const collat =
      collatHandle === ethers.ZeroHash
        ? 0n
        : await fhevm.userDecryptEuint(FhevmType.euint64, collatHandle, marketAddr, user);
    const debtNorm =
      debtNormHandle === ethers.ZeroHash
        ? 0n
        : await fhevm.userDecryptEuint(FhevmType.euint64, debtNormHandle, marketAddr, user);
    return { collat, debtNorm };
  }

  /// Drives the on-chain health check + off-chain public decryption + proof submission.
  async function runHealthCheck(user: HardhatEthersSigner, mkt: ClendMarket = market) {
    const tx = await mkt.requestHealthCheck(user.address);
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log) => mkt.interface.parseLog(log))
      .find((parsed) => parsed?.name === "HealthCheckRequested");
    const flagHandle = event!.args.flagHandle as string;

    const results = await fhevm.publicDecrypt([flagHandle]);
    await mkt.submitHealthCheck(user.address, results.abiEncodedClearValues, results.decryptionProof);
    return results.clearValues[flagHandle] as boolean;
  }

  async function runRateSync(mkt: ClendMarket = market) {
    const tx = await mkt.requestRateSync();
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log) => mkt.interface.parseLog(log))
      .find((parsed) => parsed?.name === "RateSyncRequested");
    const cashHandle = event!.args.cashHandle as string;
    const borrowsHandle = event!.args.borrowsNormHandle as string;
    const collateralHandle = event!.args.collateralHandle as string;

    const results = await fhevm.publicDecrypt([cashHandle, borrowsHandle, collateralHandle]);
    await mkt.submitRateSync(results.abiEncodedClearValues, results.decryptionProof);
  }

  describe("factory gating", function () {
    before(deployStack);

    it("rejects markets for tokens not valid in the registry", async function () {
      const Token = await ethers.getContractFactory("TestConfidentialToken");
      const rogue = await Token.deploy("Rogue", "RGE");
      await expect(
        factory.createMarket(await rogue.getAddress(), await cUSDC.getAddress()),
      ).to.be.revertedWithCustomError(factory, "NotRegistryValid");
    });

    it("rejects markets for assets without a price feed", async function () {
      const Token = await ethers.getContractFactory("TestConfidentialToken");
      const unfed = await Token.deploy("Unfed", "UNF");
      await registry.setPair(ethers.Wallet.createRandom().address, await unfed.getAddress(), true);
      await expect(
        factory.createMarket(await unfed.getAddress(), await cUSDC.getAddress()),
      ).to.be.revertedWithCustomError(factory, "NoPriceFeed");
    });

    it("rejects duplicate markets", async function () {
      await expect(
        factory.createMarket(await cWETH.getAddress(), await cUSDC.getAddress()),
      ).to.be.revertedWithCustomError(factory, "MarketExists");
    });

    it("registers the market and share token metadata", async function () {
      expect(await factory.marketsLength()).to.eq(1);
      expect(await market.symbol()).to.eq("clcUSDC");
    });
  });

  describe("lending lifecycle", function () {
    before(deployStack);

    it("mints encrypted shares 1:1 on first supply", async function () {
      const marketAddr = await market.getAddress();
      const enc = await encrypt(USD(50_000), marketAddr, lender);
      await market.connect(lender).supply(enc.handles[0], enc.inputProof);

      expect(await decryptBalance(market, lender)).to.eq(USD(50_000));
    });

    it("accepts collateral and lends within the LTV", async function () {
      const marketAddr = await market.getAddress();

      const encCollat = await encrypt(USD(10), marketAddr, borrower); // 10 WETH @ $3000
      await market.connect(borrower).addCollateral(encCollat.handles[0], encCollat.inputProof);

      const encBorrow = await encrypt(USD(10_000), marketAddr, borrower);
      const tx = await market.connect(borrower).borrow(encBorrow.handles[0], encBorrow.inputProof);
      const receipt = await tx.wait();

      expect(await decryptBalance(cUSDC, borrower)).to.eq(USD(10_000));
      const { collat, debtNorm } = await decryptPosition(borrower);
      expect(collat).to.eq(USD(10));
      expect(debtNorm).to.eq(USD(10_000));

      // FHE budget guard: stay well inside the 20M global / 5M depth HCU caps.
      const hcu = await fhevm.computeTransactionHCU(receipt!);
      expect(hcu.globalHCU).to.be.lt(20_000_000);
      expect(hcu.maxHCUDepth).to.be.lt(5_000_000);
    });

    it("clamps an over-ask borrow to the remaining borrow power without reverting", async function () {
      const marketAddr = await market.getAddress();
      // Max power = 10 WETH * $3000 * 75% = $22,500; $10,000 drawn; headroom $12,500.
      const enc = await encrypt(USD(50_000), marketAddr, borrower);
      await market.connect(borrower).borrow(enc.handles[0], enc.inputProof);

      expect(await decryptBalance(cUSDC, borrower)).to.eq(USD(22_500));
    });

    it("clamps collateral withdrawal to zero while fully levered", async function () {
      const marketAddr = await market.getAddress();
      const enc = await encrypt(USD(1), marketAddr, borrower);
      await market.connect(borrower).withdrawCollateral(enc.handles[0], enc.inputProof);

      expect(await decryptBalance(cWETH, borrower)).to.eq(0n);
      const { collat } = await decryptPosition(borrower);
      expect(collat).to.eq(USD(10));
    });

    it("repays and releases exactly the freed collateral", async function () {
      const marketAddr = await market.getAddress();

      const encRepay = await encrypt(USD(12_500), marketAddr, borrower);
      await market.connect(borrower).repay(borrower.address, encRepay.handles[0], encRepay.inputProof);

      const { debtNorm } = await decryptPosition(borrower);
      expect(debtNorm).to.eq(USD(10_000));

      // Debt $10,000 needs ceil(10000 / (3000*0.75)) = 4.444445 WETH; ~5.555 free.
      const encWithdraw = await encrypt(USD(5), marketAddr, borrower);
      await market.connect(borrower).withdrawCollateral(encWithdraw.handles[0], encWithdraw.inputProof);

      expect(await decryptBalance(cWETH, borrower)).to.eq(USD(5));
    });

    it("redeems supplier shares for underlying", async function () {
      const marketAddr = await market.getAddress();
      const enc = await encrypt(USD(10_000), marketAddr, lender);
      await market.connect(lender).withdrawSupply(enc.handles[0], enc.inputProof);

      expect(await decryptBalance(market, lender)).to.eq(USD(40_000));
      expect(await decryptBalance(cUSDC, lender)).to.eq(USD(60_000)); // 50k unsupplied + 10k redeemed
    });

    it("keeps the liquidation flag down for a healthy position", async function () {
      const liquidatable = await runHealthCheck(borrower);
      expect(liquidatable).to.eq(false);
      expect(await market.liquidatableUntil(borrower.address)).to.eq(0);

      await expect(
        market.connect(liquidator).liquidate(borrower.address, ethers.ZeroHash, "0x"),
      ).to.be.revertedWithCustomError(market, "NotLiquidatable");
    });

    it("flags, liquidates with bonus, and clears the flag after a price crash", async function () {
      // Debt $10,000 vs 5 WETH. At $1200: 5 * 1200 * 80% = $4,800 < $10,000.
      await feedWETH.postAnswer(P8(1200));
      await time.increase(61); // health-check cooldown

      const liquidatable = await runHealthCheck(borrower);
      expect(liquidatable).to.eq(true);
      expect(await market.liquidatableUntil(borrower.address)).to.be.gt(0);

      const marketAddr = await market.getAddress();
      // Close factor caps repay at 50% of $10,000; ask for $6,000, expect $5,000 used.
      const enc = await encrypt(USD(6_000), marketAddr, liquidator);
      await market.connect(liquidator).liquidate(borrower.address, enc.handles[0], enc.inputProof);

      // Seize = 5000 * 1.05 / 1200 = 4.375 WETH.
      expect(await decryptBalance(cWETH, liquidator)).to.eq(4_375_000n);
      expect(await decryptBalance(cUSDC, liquidator)).to.eq(USD(45_000));

      const { collat, debtNorm } = await decryptPosition(borrower);
      expect(debtNorm).to.eq(USD(5_000));
      expect(collat).to.eq(USD(5) - 4_375_000n);

      expect(await market.liquidatableUntil(borrower.address)).to.eq(0);
    });

    it("syncs utilization-driven rates from disclosed aggregates", async function () {
      await runRateSync();

      // Pool: 50k supplied - 22.5k borrowed + 12.5k repaid - 10k redeemed + 5k liq = 35k cash.
      // Borrows outstanding: 5k. U = 5000/40000 = 12.5% -> borrow APR = 4% * (12.5/80) = 0.625%.
      expect(await market.borrowApr6()).to.eq(6_250);
      // supply APR = 0.625% * 12.5% * 90% ≈ 703 (1e6 scale)
      expect(await market.supplyApr6()).to.eq(703);
    });

    it("accrues interest on the borrow index over time", async function () {
      const before = await market.borrowIndex6();
      await time.increase(365 * 24 * HOUR);
      await market.accrue();
      const after = await market.borrowIndex6();

      // ~0.625% APR over one year on a 1e6 index.
      expect(after - before).to.be.closeTo(6_250n, 30n);
    });
  });

  describe("v2 safeguards", function () {
    before(deployStack);

    it("rejects non-6-decimal tokens at market creation", async function () {
      const Bad = await ethers.getContractFactory("Bad18DecimalsToken");
      const bad = await Bad.deploy();
      const Market = await ethers.getContractFactory("ClendMarket");
      await expect(
        Market.deploy(
          await bad.getAddress(),
          await cUSDC.getAddress(),
          await oracle.getAddress(),
          USD(1_000_000),
          USD(800_000),
          "x",
          "x",
        ),
      ).to.be.revertedWithCustomError(Market, "UnsupportedTokenDecimals");
    });

    it("bootstrap: accepts the first supply before any sync exists", async function () {
      expect(await market.lastSyncTimestamp()).to.eq(0);
      const enc = await encrypt(USD(1_000), await market.getAddress(), lender);
      await market.connect(lender).supply(enc.handles[0], enc.inputProof);
      expect(await decryptBalance(market, lender)).to.eq(USD(1_000));
    });

    it("partial-fills a borrow when the pool lacks cash (no more zero-fills)", async function () {
      const marketAddr = await market.getAddress();
      const encCollat = await encrypt(USD(10), marketAddr, borrower); // $30k power >> pool
      await market.connect(borrower).addCollateral(encCollat.handles[0], encCollat.inputProof);

      const encBorrow = await encrypt(USD(5_000), marketAddr, borrower);
      await market.connect(borrower).borrow(encBorrow.handles[0], encBorrow.inputProof);

      // Pool only held 1,000 — borrower receives exactly that, debt records exactly that.
      expect(await decryptBalance(cUSDC, borrower)).to.eq(USD(1_000));
      const { debtNorm } = await decryptPosition(borrower);
      expect(debtNorm).to.eq(USD(1_000));
    });

    it("zero-effect borrow leaves debt untouched but bumps the nonce (documented)", async function () {
      const marketAddr = await market.getAddress();
      const [, , nonceBefore] = await market.positionOf(borrower.address);

      const enc = await encrypt(USD(500), marketAddr, borrower); // pool cash is now 0
      await market.connect(borrower).borrow(enc.handles[0], enc.inputProof);

      const { debtNorm } = await decryptPosition(borrower);
      expect(debtNorm).to.eq(USD(1_000));
      const [, , nonceAfter] = await market.positionOf(borrower.address);
      expect(nonceAfter).to.eq(nonceBefore + 1n);
    });

    it("refuses supply/borrow on stale aggregates; permissionless sync unbricks", async function () {
      await runRateSync();
      await time.increase(25 * HOUR);

      const enc = await encrypt(USD(100), await market.getAddress(), lender);
      await expect(
        market.connect(lender).supply(enc.handles[0], enc.inputProof),
      ).to.be.revertedWithCustomError(market, "SyncStale");

      await runRateSync();
      const enc2 = await encrypt(USD(100), await market.getAddress(), lender);
      await market.connect(lender).supply(enc2.handles[0], enc2.inputProof);
    });

    it("enforces sync-based supply cap from disclosed totals (overshoot documented)", async function () {
      const Market = await ethers.getContractFactory("ClendMarket");
      const tight = (await Market.deploy(
        await cWETH.getAddress(),
        await cUSDC.getAddress(),
        await oracle.getAddress(),
        USD(2_000), // supply cap
        USD(1_500),
        "tight",
        "TGT",
      )) as unknown as ClendMarket;
      const tightAddr = await tight.getAddress();
      await cUSDC.connect(lender).setOperator(tightAddr, OPERATOR_TTL);

      // Mock-only quirk: the mock KMS cannot publicly decrypt trivially-encrypted
      // zero handles (the real relayer can), so give the market real collateral
      // dust before its first sync.
      await cWETH.mint(borrower.address, USD(1));
      await cWETH.connect(borrower).setOperator(tightAddr, OPERATOR_TTL);
      const encDust = await encrypt(USD(1), tightAddr, borrower);
      await tight.connect(borrower).addCollateral(encDust.handles[0], encDust.inputProof);

      // Bootstrap supply passes (no sync yet), even above cap — documented overshoot.
      let enc = await encrypt(USD(2_500), tightAddr, lender);
      await tight.connect(lender).supply(enc.handles[0], enc.inputProof);

      // After disclosure, the gate sees totals >= cap and refuses further supply.
      await runRateSync(tight);
      enc = await encrypt(USD(100), tightAddr, lender);
      await expect(tight.connect(lender).supply(enc.handles[0], enc.inputProof)).to.be.revertedWithCustomError(
        tight,
        "SupplyCapReached",
      );
    });

    it("underfunded liquidation: no asset/debt impact, flag consumed (documented griefing)", async function () {
      // Crash collateral so the borrower (debt 1,000, collat 10 WETH) is flaggable.
      await feedWETH.postAnswer(P8(30)); // 10 * 30 * 0.8 = 240 < 1,000
      expect(await runHealthCheck(borrower)).to.eq(true);

      const griefer = (await ethers.getSigners())[5];
      const marketAddr = await market.getAddress();
      await cUSDC.connect(griefer).setOperator(marketAddr, OPERATOR_TTL);
      // A NEVER-funded account reverts at the token (ERC7984ZeroBalance) — the
      // griefing vector requires holding at least 1 dust unit.
      await cUSDC.mint(griefer.address, 1n);

      const before = await decryptPosition(borrower);
      const enc = await encrypt(USD(400), marketAddr, griefer);
      await market.connect(griefer).liquidate(borrower.address, enc.handles[0], enc.inputProof);

      const after = await decryptPosition(borrower);
      expect(after.debtNorm).to.eq(before.debtNorm);
      expect(after.collat).to.eq(before.collat);
      expect(await decryptBalance(cWETH, griefer)).to.eq(0n);
      // The griefing mutation: flag is gone and must be re-confirmed.
      expect(await market.liquidatableUntil(borrower.address)).to.eq(0);
    });

    it("bad debt: persists after collateral exhaustion, accrues, sync stays consistent", async function () {
      await time.increase(61);
      expect(await runHealthCheck(borrower)).to.eq(true);

      await cUSDC.mint(liquidator.address, USD(5_000));
      await cUSDC.connect(liquidator).setOperator(await market.getAddress(), OPERATOR_TTL);
      const enc = await encrypt(USD(500), await market.getAddress(), liquidator); // 50% close factor cap
      await market.connect(liquidator).liquidate(borrower.address, enc.handles[0], enc.inputProof);

      // Seize for 500 repaid at $30 with 5% bonus wants 17.5 WETH > 10 held -> takes all 10.
      const pos = await decryptPosition(borrower);
      expect(pos.collat).to.eq(0n);
      expect(pos.debtNorm).to.be.gt(0n); // residual bad debt

      await time.increase(365 * 24 * HOUR);
      await market.accrue();
      await runRateSync();

      // Known v1 invariant: bad debt distorts utilization/APR until written off —
      // the system must keep functioning and reporting consistently.
      expect(await market.lastSyncBorrows()).to.be.gte(pos.debtNorm);
      expect(await market.lastSyncCollateral()).to.eq(0n);
      expect(await market.borrowApr6()).to.be.gt(0n);
    });

    it("handles euint64-scale amounts without overflow", async function () {
      const whale = (await ethers.getSigners())[6];
      const big = 2n ** 62n; // ~4.6e18 units
      await cUSDC.mint(whale.address, big);
      const marketAddr = await market.getAddress();
      await cUSDC.connect(whale).setOperator(marketAddr, OPERATOR_TTL);

      const input = fhevm.createEncryptedInput(marketAddr, whale.address);
      input.add64(big);
      const enc = await input.encrypt();
      await market.connect(whale).supply(enc.handles[0], enc.inputProof);

      const shares = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        await market.confidentialBalanceOf(whale.address),
        marketAddr,
        whale,
      );
      // shares = floor(big * 1e6 / supplyIndex6) — index grew in earlier tests
      // (a year at high utilization), so compute the exact expectation.
      const idx = await market.supplyIndex6();
      expect(shares).to.be.closeTo((big * WAD6) / idx, 2n);
    });
  });
});
