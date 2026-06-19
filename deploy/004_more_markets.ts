import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { SEPOLIA } from "./001_oracle";

const TTL_CHAINLINK = 48 * 3600;
const TTL_POSTED = 30 * 24 * 3600;
const ONE_USD_8 = 100_000_000n;

// Second wave, after verifying ALL documented registry pairs are valid on-chain:
// ctGBP/cXAUt on real Chainlink feeds, cUSDT/cBRON on disclosed posted feeds.
const NEW_MARKETS: Array<{ collat: string; debt: string; label: string }> = [
  { collat: SEPOLIA.CTGBP_MOCK, debt: SEPOLIA.CUSDC, label: "ctGBP collateral -> borrow cUSDC" },
  { collat: SEPOLIA.CXAUT, debt: SEPOLIA.CUSDC, label: "cXAUt collateral -> borrow cUSDC" },
  { collat: SEPOLIA.CUSDT, debt: SEPOLIA.CUSDC, label: "cUSDT collateral -> borrow cUSDC" },
  { collat: SEPOLIA.CBRON, debt: SEPOLIA.CUSDC, label: "cBRON collateral -> borrow cUSDC" },
];

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name !== "sepolia") return;
  const { deploy, execute, get, log } = hre.deployments;
  const { deployer } = await hre.getNamedAccounts();
  const [signer] = await hre.ethers.getSigners();

  const usdtFeed = await deploy("PostedFeedUSDT", {
    contract: "PostedPriceFeed",
    from: deployer,
    args: [deployer, "USDT / USD (posted)", ONE_USD_8],
    log: true,
  });
  const bronFeed = await deploy("PostedFeedBRON", {
    contract: "PostedPriceFeed",
    from: deployer,
    args: [deployer, "BRON / USD (posted)", ONE_USD_8],
    log: true,
  });

  const oracle = await hre.ethers.getContractAt("ClendPriceOracle", (await get("ClendPriceOracle")).address, signer);
  const feedPlan: Array<[string, string, number]> = [
    [SEPOLIA.CTGBP_MOCK, SEPOLIA.FEED_GBP_USD, TTL_CHAINLINK],
    [SEPOLIA.CXAUT, SEPOLIA.FEED_XAU_USD, TTL_CHAINLINK],
    [SEPOLIA.CUSDT, usdtFeed.address, TTL_POSTED],
    [SEPOLIA.CBRON, bronFeed.address, TTL_POSTED],
  ];
  for (const [asset, feed, ttl] of feedPlan) {
    const [existing] = await oracle.feedOf(asset);
    if (existing !== hre.ethers.ZeroAddress) {
      log(`feed exists for ${asset}`);
      continue;
    }
    await execute("ClendPriceOracle", { from: deployer, log: true }, "setFeed", asset, feed, ttl);
  }

  const factory = await hre.ethers.getContractAt("ClendFactory", (await get("ClendFactory")).address, signer);
  for (const market of NEW_MARKETS) {
    const existing = await factory.marketFor(market.collat, market.debt);
    if (existing !== hre.ethers.ZeroAddress) {
      log(`Market exists (${market.label}): ${existing}`);
      continue;
    }
    const tx = await factory.createMarket(market.collat, market.debt);
    await tx.wait();
    log(`Market created (${market.label}): ${await factory.marketFor(market.collat, market.debt)}`);
  }
};

export default func;
func.tags = ["MoreMarkets"];
func.dependencies = ["Markets"];
