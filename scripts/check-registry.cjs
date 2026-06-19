/* Definitive registry check: pulls the REAL implementation ABI from Etherscan
 * (no hand-written tuple guesses) and tests every documented wrapper address
 * directly via isConfidentialTokenValid. Run: node scripts/check-registry.cjs */
const { ethers } = require("ethers");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const REGISTRY_PROXY = "0x2f0750Bbb0A246059d80e94c454586a7F27a128e";
const REGISTRY_IMPL = "0x50c271e25ee953dd21e916311db81e228c9bdb59";

// Every confidential wrapper listed in the Sepolia docs.
const DOCUMENTED_WRAPPERS = [
  ["cUSDCMock", "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639"],
  ["cUSDTMock", "0x4E7B06D78965594eB5EF5414c357ca21E1554491"],
  ["cWETHMock", "0x46208622DA27d91db4f0393733C8BA082ed83158"],
  ["cBRONMock", "0xaa5612FA27c927a0c7961f5AEFEE5ba3A0F9C891"],
  ["cZAMAMock", "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB"],
  ["ctGBPMock", "0xfCE5c7069c5525eF6c8C2b2E35A745bA20a2F7CC"],
  ["cXAUtMock", "0xe4FcF848739845BC81Dee1d5352cf3844F0a60C7"],
  ["ctGBP", "0x167DC962808B32CFFFc7e14B5018c0bE06A3A208"],
];

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

  // 1. real ABI from Etherscan (implementation behind the proxy)
  const url = `https://api.etherscan.io/v2/api?chainid=11155111&module=contract&action=getabi&address=${REGISTRY_IMPL}&apikey=${process.env.ETHERSCAN_API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "1") throw new Error(`ABI fetch failed: ${json.result}`);
  const abi = JSON.parse(json.result);

  const pairsFn = abi.find((f) => f.name === "getTokenConfidentialTokenPairs");
  console.log("getTokenConfidentialTokenPairs output components:");
  console.log(JSON.stringify(pairsFn.outputs, null, 2));

  const registry = new ethers.Contract(REGISTRY_PROXY, abi, provider);

  // 2. the definitive per-wrapper test — no tuple decoding involved
  console.log("\nDirect isConfidentialTokenValid checks:");
  for (const [name, addr] of DOCUMENTED_WRAPPERS) {
    const valid = await registry.isConfidentialTokenValid(addr);
    const [okToken, tokenAddr] = await registry.getTokenAddress(addr);
    console.log(
      `${name.padEnd(10)} ${addr}  valid=${valid}  underlying=${okToken ? tokenAddr : "(not resolved)"}`,
    );
  }

  // 3. full pair enumeration with the REAL ABI
  console.log("\nFull on-chain pair list (real ABI):");
  const pairs = await registry.getTokenConfidentialTokenPairs();
  for (const p of pairs) {
    console.log(JSON.stringify(p, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
