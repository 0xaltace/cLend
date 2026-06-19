import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const FACTORY = "0x637b659871F914f1c8E6Ab59F9A1c36299Bb4Fb1";
const OPERATOR_TTL = 4_000_000_000;
const SIX = 1_000_000n;

const WRAPPER_ABI = [
  "function wrap(address to, uint256 amount)",
  "function underlying() view returns (address)",
  "function rate() view returns (uint256)",
  "function setOperator(address operator, uint48 until)",
  "function symbol() view returns (string)",
];
const ERC20_ABI = [
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

// Supply per market keyed by the debt token symbol.
const SUPPLY_BY_DEBT: Record<string, bigint> = {
  cUSDCMock: 50_000n * SIX,
  cWETHMock: 20n * SIX,
};

/**
 * Seeds every market with lender liquidity, opens one demo borrow in the
 * flagship cWETH->cUSDC market, and runs an initial rate sync everywhere so
 * TVL/utilization/caps have a real snapshot.
 *
 *   npx hardhat --network sepolia clend:seed
 */
task("clend:seed", "Seeds liquidity + initial syncs across all markets").setAction(async function (
  _args: TaskArguments,
  hre,
) {
  const { ethers, fhevm } = hre;
  await fhevm.initializeCLIApi();
  const [signer] = await ethers.getSigners();
  console.log(`seeder: ${signer.address}`);

  const factory = await ethers.getContractAt("ClendFactory", FACTORY, signer);
  const markets: string[] = await factory.allMarkets();
  console.log(`${markets.length} markets`);

  const wrapped = new Set<string>();

  async function ensureWrapped(cToken: string, units: bigint, label: string) {
    const key = `${cToken}:${units}`;
    if (wrapped.has(key)) return;
    const wrapper = new ethers.Contract(cToken, WRAPPER_ABI, signer);
    const underlyingAddr: string = await wrapper.underlying();
    const rate: bigint = await wrapper.rate();
    const underlying = new ethers.Contract(underlyingAddr, ERC20_ABI, signer);
    const need = units * rate;
    console.log(`  wrapping ${label}…`);
    await (await underlying.mint(signer.address, need)).wait();
    await (await underlying.approve(cToken, need)).wait();
    await (await wrapper.wrap(signer.address, need)).wait();
    wrapped.add(key);
  }

  async function encrypt(amount: bigint, contract: string) {
    const input = fhevm.createEncryptedInput(contract, signer.address);
    input.add64(amount);
    return input.encrypt();
  }

  async function rateSync(marketAddr: string, market: any) {
    const tx = await market.requestRateSync();
    const receipt = await tx.wait();
    const ev = receipt.logs
      .map((l: any) => {
        try {
          return market.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((p: any) => p?.name === "RateSyncRequested");
    const handles = [ev.args.cashHandle, ev.args.borrowsNormHandle, ev.args.collateralHandle];
    const res = await fhevm.publicDecrypt(handles);
    await (await market.submitRateSync(res.abiEncodedClearValues, res.decryptionProof)).wait();
  }

  for (let i = 0; i < markets.length; i++) {
    const marketAddr = markets[i];
    const market = await ethers.getContractAt("ClendMarket", marketAddr, signer);
    const debtToken: string = await market.DEBT_TOKEN();
    const collatToken: string = await market.COLLATERAL_TOKEN();
    const debtSym: string = await new ethers.Contract(debtToken, WRAPPER_ABI, signer).symbol();
    const collatSym: string = await new ethers.Contract(collatToken, WRAPPER_ABI, signer).symbol();
    const supplyUnits = SUPPLY_BY_DEBT[debtSym] ?? 10_000n * SIX;

    console.log(`\n[${i + 1}/${markets.length}] ${collatSym} -> ${debtSym}  ${marketAddr}`);

    // Supply side
    await ensureWrapped(debtToken, supplyUnits, `${supplyUnits / SIX} ${debtSym}`);
    await (await new ethers.Contract(debtToken, WRAPPER_ABI, signer).setOperator(marketAddr, OPERATOR_TTL)).wait();
    let enc = await encrypt(supplyUnits, marketAddr);
    await (await market.supply(enc.handles[0], enc.inputProof)).wait();
    console.log(`  supplied ${supplyUnits / SIX} ${debtSym}`);

    // Demo borrow only in the flagship market (i == 0: cWETH -> cUSDC)
    if (i === 0) {
      const collatUnits = 10n * SIX; // 10 cWETH
      await ensureWrapped(collatToken, collatUnits, `${collatUnits / SIX} ${collatSym}`);
      await (await new ethers.Contract(collatToken, WRAPPER_ABI, signer).setOperator(marketAddr, OPERATOR_TTL)).wait();
      enc = await encrypt(collatUnits, marketAddr);
      await (await market.addCollateral(enc.handles[0], enc.inputProof)).wait();
      enc = await encrypt(8_000n * SIX, marketAddr); // borrow 8k cUSDC -> ~16% util
      await (await market.borrow(enc.handles[0], enc.inputProof)).wait();
      console.log(`  added 10 ${collatSym} collateral, borrowed 8000 ${debtSym}`);
    }

    await rateSync(marketAddr, market);
    const snap = await market.marketSnapshot();
    console.log(`  synced: cash=${snap[0] / SIX} borrows=${snap[1] / SIX} util=${Number(snap[3]) / 10000}%`);
  }

  console.log("\nSEED COMPLETE");
});
