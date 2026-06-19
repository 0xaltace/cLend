import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Official Zama cTokenMocks on Sepolia (validated live in the Wrappers Registry).
export const SEPOLIA = {
  REGISTRY: "0x2f0750Bbb0A246059d80e94c454586a7F27a128e",
  CUSDC: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
  CUSDT: "0x4E7B06D78965594eB5EF5414c357ca21E1554491",
  CWETH: "0x46208622DA27d91db4f0393733C8BA082ed83158",
  CBRON: "0xaa5612FA27c927a0c7961f5AEFEE5ba3A0F9C891",
  CZAMA: "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB",
  CTGBP_MOCK: "0xfCE5c7069c5525eF6c8C2b2E35A745bA20a2F7CC",
  CXAUT: "0xe4FcF848739845BC81Dee1d5352cf3844F0a60C7",
  // Chainlink feeds, verified on-chain via description().
  FEED_ETH_USD: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  FEED_USDC_USD: "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
  FEED_GBP_USD: "0x91FAB41F5f3bE955963a986366edAcff1aaeaa83",
  FEED_XAU_USD: "0xC5981F461d74c46eB4b0CF3f4Ec79f025573B0Ea",
} as const;

// Generous testnet staleness TTLs — Sepolia feed heartbeats are slow and a stale
// feed bricks borrows. Mainnet listings would use much tighter windows.
const TTL_CHAINLINK = 48 * 3600;
const TTL_POSTED = 30 * 24 * 3600;

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name !== "sepolia") return;
  const { deploy, execute, log } = hre.deployments;
  const { deployer } = await hre.getNamedAccounts();

  const oracle = await deploy("ClendPriceOracle", { from: deployer, args: [deployer], log: true });

  // ZAMA mock has no Chainlink feed on Sepolia; posted feed at $0.10, disclosed in UI.
  const zamaFeed = await deploy("PostedPriceFeed", {
    from: deployer,
    args: [deployer, "ZAMA / USD (posted)", 10_000_000n],
    log: true,
  });

  await execute("ClendPriceOracle", { from: deployer, log: true }, "setFeed", SEPOLIA.CWETH, SEPOLIA.FEED_ETH_USD, TTL_CHAINLINK);
  await execute("ClendPriceOracle", { from: deployer, log: true }, "setFeed", SEPOLIA.CUSDC, SEPOLIA.FEED_USDC_USD, TTL_CHAINLINK);
  await execute("ClendPriceOracle", { from: deployer, log: true }, "setFeed", SEPOLIA.CZAMA, zamaFeed.address, TTL_POSTED);

  log(`Oracle ${oracle.address} configured with 3 feeds`);
};

export default func;
func.tags = ["Oracle"];
