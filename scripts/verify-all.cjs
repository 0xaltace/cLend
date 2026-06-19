/* Verifies the factory + every factory-created market on Etherscan, reconstructing
 * each market's constructor args from on-chain immutables. Run:
 *   npx hardhat run scripts/verify-all.cjs --network sepolia */
const hre = require("hardhat");

const FACTORY = "0x637b659871F914f1c8E6Ab59F9A1c36299Bb4Fb1";
const REGISTRY = "0x2f0750Bbb0A246059d80e94c454586a7F27a128e";
const ORACLE = "0x457ACAA3d8689652a7489a2a53B94c0aAD52e44c";

const SUPPLY_CAP = 100_000_000n * 1_000_000n;
const BORROW_CAP = 80_000_000n * 1_000_000n;

async function tryVerify(address, constructorArguments) {
  try {
    await hre.run("verify:verify", { address, constructorArguments });
    console.log(`  verified ${address}`);
  } catch (e) {
    const msg = e.message || String(e);
    if (msg.toLowerCase().includes("already verified")) console.log(`  already verified ${address}`);
    else console.log(`  FAILED ${address}: ${msg.slice(0, 160)}`);
  }
}

async function main() {
  console.log("=== factory ===");
  await tryVerify(FACTORY, [REGISTRY, ORACLE]);

  const factory = await hre.ethers.getContractAt("ClendFactory", FACTORY);
  const markets = await factory.allMarkets();
  const erc7984 = ["function symbol() view returns (string)"];

  for (const addr of markets) {
    const m = await hre.ethers.getContractAt("ClendMarket", addr);
    const collat = await m.COLLATERAL_TOKEN();
    const debt = await m.DEBT_TOKEN();
    const collatSym = await (await hre.ethers.getContractAt(erc7984, collat)).symbol();
    const debtSym = await (await hre.ethers.getContractAt(erc7984, debt)).symbol();
    const name = `cLend Supply ${debtSym} (${collatSym} collateral)`;
    const symbol = `cl${debtSym}`;
    console.log(`=== market ${addr} (${collatSym} -> ${debtSym}) ===`);
    await tryVerify(addr, [collat, debt, ORACLE, SUPPLY_CAP, BORROW_CAP, name, symbol]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
