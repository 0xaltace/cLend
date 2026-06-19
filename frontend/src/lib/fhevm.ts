/**
 * Zama relayer SDK bootstrap + cached user-decryption sessions.
 *
 * The EIP-712 user-decryption flow needs a keypair plus a wallet signature.
 * Signing on every balance refresh would be unbearable, so we cache one
 * session (keypair + signature, scoped to the contract set) in localStorage
 * for its validity window. One signature decrypts everything for 24 hours.
 */
import { createInstance, initSDK, SepoliaConfig, type FhevmInstance } from "@zama-fhe/relayer-sdk/web";

let instancePromise: Promise<FhevmInstance> | null = null;

type NetworkProvider = Parameters<typeof createInstance>[0]["network"];

export function getFhevm(): Promise<FhevmInstance> {
  if (!instancePromise) {
    instancePromise = (async () => {
      await initSDK();
      return createInstance({
        ...SepoliaConfig,
        network: (window as unknown as { ethereum: NetworkProvider }).ethereum,
      });
    })();
  }
  return instancePromise;
}

export interface DecryptionSession {
  keypair: { publicKey: string; privateKey: string };
  signature: string;
  contracts: string[];
  startTimestamp: number;
  durationDays: number;
  userAddress: string;
}

const SESSION_KEY_PREFIX = "clend.decryptSession.v3";
const SESSION_DAYS = 1; // one wallet signature per 24h
/** Relayer SDK hard limit: an EIP-712 decryption session covers at most 10 contracts. */
export const MAX_SESSION_CONTRACTS = 10;

export async function getDecryptionSession(
  name: string,
  userAddress: string,
  contracts: string[],
  signTypedData: (args: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<string>,
): Promise<DecryptionSession> {
  if (contracts.length > MAX_SESSION_CONTRACTS) {
    throw new Error(`session "${name}" exceeds the ${MAX_SESSION_CONTRACTS}-contract limit`);
  }
  const sorted = [...contracts].sort();

  const cached = localStorage.getItem(`${SESSION_KEY_PREFIX}.${name}`);
  if (cached) {
    try {
      const session = JSON.parse(cached) as DecryptionSession;
      const expires = (session.startTimestamp + session.durationDays * 86_400) * 1000;
      const sameUser = session.userAddress.toLowerCase() === userAddress.toLowerCase();
      const coversContracts = sorted.every((c) =>
        session.contracts.map((s) => s.toLowerCase()).includes(c.toLowerCase()),
      );
      if (sameUser && coversContracts && Date.now() < expires - 60_000) return session;
    } catch {
      // fall through to a fresh session
    }
  }

  const fhevm = await getFhevm();
  const keypair = fhevm.generateKeypair();
  const startTimestamp = Math.floor(Date.now() / 1000);
  const eip712 = fhevm.createEIP712(keypair.publicKey, sorted, startTimestamp, SESSION_DAYS);

  const signature = await signTypedData({
    domain: eip712.domain as unknown as Record<string, unknown>,
    types: { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification } as Record<string, unknown>,
    primaryType: "UserDecryptRequestVerification",
    message: eip712.message as unknown as Record<string, unknown>,
  });

  const session: DecryptionSession = {
    keypair,
    signature,
    contracts: sorted,
    startTimestamp,
    durationDays: SESSION_DAYS,
    userAddress,
  };
  localStorage.setItem(`${SESSION_KEY_PREFIX}.${name}`, JSON.stringify(session));
  return session;
}

export function clearDecryptionSession(name: string) {
  localStorage.removeItem(`${SESSION_KEY_PREFIX}.${name}`);
}

/** True when a still-valid cached session exists for this user+contract set —
 *  meaning decryption can run silently, with no wallet prompt. */
export function hasCachedSession(name: string, userAddress: string, contracts: string[]): boolean {
  const cached = localStorage.getItem(`${SESSION_KEY_PREFIX}.${name}`);
  if (!cached) return false;
  try {
    const session = JSON.parse(cached) as DecryptionSession;
    const expires = (session.startTimestamp + session.durationDays * 86_400) * 1000;
    return (
      session.userAddress.toLowerCase() === userAddress.toLowerCase() &&
      contracts.every((c) => session.contracts.map((s) => s.toLowerCase()).includes(c.toLowerCase())) &&
      Date.now() < expires - 60_000
    );
  } catch {
    return false;
  }
}

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** Batch-decrypt euint64 handles for the session user. Zero handles short-circuit to 0n. */
export async function userDecryptBatch(
  session: DecryptionSession,
  pairs: Array<{ handle: string; contractAddress: string }>,
): Promise<bigint[]> {
  const live = pairs.filter((p) => p.handle !== ZERO_HANDLE);
  let decrypted: Record<string, string | bigint | boolean> = {};
  if (live.length > 0) {
    const fhevm = await getFhevm();
    decrypted = await fhevm.userDecrypt(
      live.map((p) => ({ handle: p.handle, contractAddress: p.contractAddress })),
      session.keypair.privateKey,
      session.keypair.publicKey,
      session.signature.replace(/^0x/, ""),
      session.contracts,
      session.userAddress,
      session.startTimestamp,
      session.durationDays,
    );
  }
  return pairs.map((p) => (p.handle === ZERO_HANDLE ? 0n : BigInt(decrypted[p.handle] as string | bigint)));
}

/** Public decryption (health-check flags, rate-sync aggregates). */
export async function publicDecrypt(handles: string[]) {
  const fhevm = await getFhevm();
  return fhevm.publicDecrypt(handles);
}
