/** cLend Sepolia deployment + official Zama protocol addresses. */

export const ADDRESSES = {
  /** Official Zama Confidential Wrappers Registry (Sepolia). */
  registry: "0x2f0750Bbb0A246059d80e94c454586a7F27a128e",
  factory: "0x637b659871F914f1c8E6Ab59F9A1c36299Bb4Fb1",
  oracle: "0x457ACAA3d8689652a7489a2a53B94c0aAD52e44c",
  zamaPostedFeed: "0x2fbd96f28b39f18A18728d72035ed164f675F0bb",
} as const;

export interface AssetInfo {
  symbol: string;
  cToken: `0x${string}`;
  logo: string;
  /** Marks assets priced by our posted feed instead of Chainlink. */
  postedFeed?: boolean;
}

export const ASSETS: Record<string, AssetInfo> = {
  cWETH: {
    symbol: "cWETH",
    cToken: "0x46208622DA27d91db4f0393733C8BA082ed83158",
    logo: "Ξ",
  },
  cUSDC: {
    symbol: "cUSDC",
    cToken: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
    logo: "$",
  },
  cZAMA: {
    symbol: "cZAMA",
    cToken: "0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB",
    logo: "Z",
    postedFeed: true,
  },
  ctGBP: {
    symbol: "ctGBP",
    cToken: "0xfCE5c7069c5525eF6c8C2b2E35A745bA20a2F7CC",
    logo: "£",
  },
  cXAUt: {
    symbol: "cXAUt",
    cToken: "0xe4FcF848739845BC81Dee1d5352cf3844F0a60C7",
    logo: "✦",
  },
  cUSDT: {
    symbol: "cUSDT",
    cToken: "0x4E7B06D78965594eB5EF5414c357ca21E1554491",
    logo: "₮",
    postedFeed: true,
  },
  cBRON: {
    symbol: "cBRON",
    cToken: "0xaa5612FA27c927a0c7961f5AEFEE5ba3A0F9C891",
    logo: "B",
    postedFeed: true,
  },
} as const;

export interface MarketInfo {
  address: `0x${string}`;
  collateral: AssetInfo;
  debt: AssetInfo;
}

// Live Chainlink-fed markets first; posted-feed (◆) markets at the bottom.
export const MARKETS: MarketInfo[] = [
  {
    address: "0x00c8f6f2e8C76FDe97a38D23Cd704D8C8D869E0B",
    collateral: ASSETS.cWETH,
    debt: ASSETS.cUSDC,
  },
  {
    address: "0xfa72F36df15398A756074fA8DF7E1c3C5A5C7EBB",
    collateral: ASSETS.cUSDC,
    debt: ASSETS.cWETH,
  },
  {
    address: "0x76d985d0754B2bFE0c9296f41c93A658C9E3f259",
    collateral: ASSETS.ctGBP,
    debt: ASSETS.cUSDC,
  },
  {
    address: "0x9997C4458deE86708d90D4Fc409586C2b83F98E1",
    collateral: ASSETS.cXAUt,
    debt: ASSETS.cUSDC,
  },
  {
    address: "0x0A0ec13f887cdA3067223Cae614B3b29aDDCb467",
    collateral: ASSETS.cZAMA,
    debt: ASSETS.cUSDC,
  },
  {
    address: "0x96f1fBd00630656D45c5E677e9de6c43749C8149",
    collateral: ASSETS.cUSDT,
    debt: ASSETS.cUSDC,
  },
  {
    address: "0xc01b1CF0f2F4dC36C5FF7ec2C1fa1aC18795a159",
    collateral: ASSETS.cBRON,
    debt: ASSETS.cUSDC,
  },
];

export const WAD6 = 1_000_000n;
export const OPERATOR_TTL_SECONDS = 60 * 60 * 24 * 30; // 30-day operator approvals
