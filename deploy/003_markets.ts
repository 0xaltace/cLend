import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { SEPOLIA } from "./001_oracle";

const MARKETS: Array<{ collat: string; debt: string; label: string }> = [
  { collat: SEPOLIA.CWETH, debt: SEPOLIA.CUSDC, label: "cWETH collateral -> borrow cUSDC" },
  { collat: SEPOLIA.CUSDC, debt: SEPOLIA.CWETH, label: "cUSDC collateral -> borrow cWETH" },
  { collat: SEPOLIA.CZAMA, debt: SEPOLIA.CUSDC, label: "cZAMA collateral -> borrow cUSDC" },
];

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name !== "sepolia") return;
  const { get, log } = hre.deployments;
  const [signer] = await hre.ethers.getSigners();

  const factoryDeployment = await get("ClendFactory");
  const factory = await hre.ethers.getContractAt("ClendFactory", factoryDeployment.address, signer);

  for (const market of MARKETS) {
    const existing = await factory.marketFor(market.collat, market.debt);
    if (existing !== hre.ethers.ZeroAddress) {
      log(`Market exists (${market.label}): ${existing}`);
      continue;
    }
    const tx = await factory.createMarket(market.collat, market.debt);
    await tx.wait();
    const created = await factory.marketFor(market.collat, market.debt);
    log(`Market created (${market.label}): ${created}`);
  }
};

export default func;
func.tags = ["Markets"];
func.dependencies = ["Factory"];
