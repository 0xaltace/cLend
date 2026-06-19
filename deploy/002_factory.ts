import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { SEPOLIA } from "./001_oracle";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name !== "sepolia") return;
  const { deploy, get } = hre.deployments;
  const { deployer } = await hre.getNamedAccounts();

  const oracle = await get("ClendPriceOracle");
  await deploy("ClendFactory", { from: deployer, args: [SEPOLIA.REGISTRY, oracle.address], log: true });
};

export default func;
func.tags = ["Factory"];
func.dependencies = ["Oracle"];
