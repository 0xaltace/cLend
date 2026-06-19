import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const FACTORY = "0x637b659871F914f1c8E6Ab59F9A1c36299Bb4Fb1";

/**
 * Keeper loop: keeps every market's public aggregates fresh (rate sync) and
 * sweeps health checks across known borrowers, decrypting the one-bit verdict
 * and flagging liquidatable positions. Permissionless — this is just one
 * automated participant; anyone can run the same calls.
 *
 *   npx hardhat --network sepolia clend:keeper --interval 300
 */
task("clend:keeper", "Refreshes rates (and optionally sweeps health checks)")
  .addOptionalParam("interval", "Seconds between passes", "300")
  .addOptionalParam("once", "Run a single pass and exit (true/false)", "false")
  .addOptionalParam("health", "Also sweep health checks on borrowers (gas-heavy)", "false")
  .setAction(async function (args: TaskArguments, hre) {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    // Run from the populate main wallet when present (the one you fund for sync),
    // otherwise the default deployer signer.
    const phrase = process.env.POPULATE_MNEMONIC;
    const signer = phrase
      ? ethers.HDNodeWallet.fromPhrase(phrase, undefined, "m/44'/60'/0'/0/0").connect(ethers.provider)
      : (await ethers.getSigners())[0];

    const intervalMs = Number(args.interval) * 1000;
    const once = args.once === "true";
    const doHealth = args.health === "true";

    const factory = await ethers.getContractAt("ClendFactory", FACTORY, signer);
    const markets: string[] = await factory.allMarkets();
    console.log(`keeper ${signer.address} watching ${markets.length} markets, interval ${args.interval}s`);

    const knownBorrowers = new Map<string, Set<string>>(); // market -> borrowers

    async function harvestBorrowers(marketAddr: string, market: any) {
      const set = knownBorrowers.get(marketAddr) ?? new Set<string>();
      const latest = await ethers.provider.getBlockNumber();
      const from = latest - 9_000 > 0 ? latest - 9_000 : 0;
      const logs = await market.queryFilter(market.filters.Borrowed(), from, latest);
      for (const l of logs) set.add((l.args.user as string).toLowerCase());
      knownBorrowers.set(marketAddr, set);
      return set;
    }

    async function rateSync(marketAddr: string, market: any) {
      const lastSync = Number(await market.lastRateSyncTs());
      const interval = Number(await market.RATE_SYNC_INTERVAL());
      const now = Math.floor(Date.now() / 1000);
      if (now - lastSync < interval) return false;

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
      console.log(`  [${marketAddr.slice(0, 8)}] rate synced`);
      return true;
    }

    async function checkBorrower(marketAddr: string, market: any, user: string) {
      const cooldown = Number(await market.HEALTH_CHECK_COOLDOWN());
      const last = Number(await market.lastHealthCheckTs(user));
      const now = Math.floor(Date.now() / 1000);
      if (now - last < cooldown) return;

      const tx = await market.requestHealthCheck(user);
      const receipt = await tx.wait();
      const ev = receipt.logs
        .map((l: any) => {
          try {
            return market.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((p: any) => p?.name === "HealthCheckRequested");
      const handle = ev.args.flagHandle as string;
      const res = await fhevm.publicDecrypt([handle]);
      await (await market.submitHealthCheck(user, res.abiEncodedClearValues, res.decryptionProof)).wait();
      const liquidatable = res.clearValues[handle] as boolean;
      console.log(`  [${marketAddr.slice(0, 8)}] ${user.slice(0, 10)} -> ${liquidatable ? "LIQUIDATABLE" : "healthy"}`);
    }

    async function pass() {
      const stamp = new Date().toISOString().slice(11, 19);
      console.log(`\n[${stamp}] keeper pass`);
      for (const marketAddr of markets) {
        const market = await ethers.getContractAt("ClendMarket", marketAddr, signer);
        try {
          await rateSync(marketAddr, market);
          if (doHealth) {
            const borrowers = await harvestBorrowers(marketAddr, market);
            for (const user of borrowers) await checkBorrower(marketAddr, market, user);
          }
        } catch (e) {
          console.log(`  [${marketAddr.slice(0, 8)}] error: ${(e as Error).message.slice(0, 100)}`);
        }
      }
    }

    await pass();
    if (once) return;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise((r) => setTimeout(r, intervalMs));
      await pass();
    }
  });
