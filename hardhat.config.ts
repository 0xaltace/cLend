import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import * as dotenv from "dotenv";
import type { HardhatUserConfig } from "hardhat/config";
import "solidity-coverage";

import "./tasks/seed";
import "./tasks/keeper";

// Local-only dev tasks (populate / boost) live in the gitignored xyz/ folder and
// are absent in clean clones — load them only if present.
for (const t of ["./xyz/populate", "./xyz/boost"]) {
  try {
    require(t);
  } catch {
    /* not present in a fresh clone — fine */
  }
}

dotenv.config();

const MNEMONIC: string = "test test test test test test test test test test test junk";
const PRIVATE_KEY: string = process.env.PRIVATE_KEY ?? "";
// Backend tasks (deploy, sync keeper, populate) prefer the Alchemy RPC when set
// — it is never shipped to the browser, so no key exposure. The frontend uses
// public RPCs (see frontend/src/lib/wagmi.ts).
const SEPOLIA_RPC_URL: string = process.env.ALCHEMY_RPC_URL || process.env.SEPOLIA_RPC_URL || "";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: 0,
  },
  etherscan: {
    // Plain-string key enables hardhat-verify's native Etherscan API V2 mode.
    apiKey: process.env.ETHERSCAN_API_KEY ?? "",
  },
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic: MNEMONIC,
      },
      chainId: 31337,
    },
    anvil: {
      accounts: {
        mnemonic: MNEMONIC,
        path: "m/44'/60'/0'/0/",
        count: 10,
      },
      chainId: 31337,
      url: "http://localhost:8545",
    },
    sepolia: {
      accounts: PRIVATE_KEY ? [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`] : [],
      chainId: 11155111,
      url: SEPOLIA_RPC_URL,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.28",
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/hardhat-template/issues/31
        bytecodeHash: "none",
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 800,
      },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
