// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
export type NetworkKey = "paseo" | "paseo-next-v2" | "previewnet";

export const SUPPORTED_NETWORKS: NetworkKey[] = ["paseo", "paseo-next-v2", "previewnet"];
export const DEFAULT_NETWORK: NetworkKey = "paseo";

export interface ChainEndpoint {
  wsUrl: string;
  genesisHash: `0x${string}` | "";
}

export interface NativeToken {
  symbol: string;
  decimals: number;
}

export interface NetworkConfig {
  key: NetworkKey;
  displayName: string;
  isTestnet: boolean;
  mainChain: ChainEndpoint;
  bulletinChain: ChainEndpoint | null;
  peopleChain: ChainEndpoint | null;
  ipfsGateway: string;
  nativeToken: NativeToken;
}

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  paseo: {
    key: "paseo",
    displayName: "Paseo Asset Hub",
    isTestnet: true,
    mainChain: { wsUrl: "wss://asset-hub-paseo.ibp.network", genesisHash: "0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2" },
    bulletinChain: { wsUrl: "wss://paseo-bulletin-rpc.polkadot.io", genesisHash: "0x744960c32e3a3df5440e1ecd4d34096f1ce2230d7016a5ada8a765d5a622b4ea" },
    peopleChain: null,
    ipfsGateway: "https://paseo-ipfs.polkadot.io",
    nativeToken: { symbol: "PAS", decimals: 10 },
  },
  "paseo-next-v2": {
    key: "paseo-next-v2",
    displayName: "Paseo Next V2",
    isTestnet: true,
    mainChain: { wsUrl: "wss://paseo-asset-hub-next-rpc.polkadot.io", genesisHash: "0xbf0488dbe9daa1de1c08c5f743e26fdc2a4ecd74cf87dd1b4b1eeb99ae4ef19f" },
    bulletinChain: { wsUrl: "wss://paseo-bulletin-next-rpc.polkadot.io", genesisHash: "0x8cfe6717dc4becfda2e13c488a1e2061ff2dfee96e7d031157f72d36716c0a22" },
    peopleChain: { wsUrl: "wss://paseo-people-next-system-rpc.polkadot.io", genesisHash: "0xc5af1826b31493f08b7e2a823842f98575b806a784126f28da9608c68665afa5" },
    ipfsGateway: "https://paseo-bulletin-next-ipfs.polkadot.io",
    nativeToken: { symbol: "PAS", decimals: 10 },
  },
  previewnet: {
    key: "previewnet",
    displayName: "Previewnet (substrate.dev)",
    isTestnet: true,
    mainChain: { wsUrl: "wss://previewnet.substrate.dev/asset-hub", genesisHash: "0x29f7b15e6227f86b90bf5199b5c872c28649a30e5f15fae6dd8fa9d5d48d6fbb" },
    bulletinChain: { wsUrl: "wss://previewnet.substrate.dev/bulletin", genesisHash: "0xf37fa1f1450ea120edbf64c3fc447f671a00e1f1095a698f42eeec073c7ee487" },
    peopleChain: null,
    ipfsGateway: "https://previewnet.substrate.dev/ipfs/",
    nativeToken: { symbol: "PAS", decimals: 10 },
  },
};

export interface NetworkOverrides {
  mainGenesisHash?: string;
  bulletinGenesisHash?: string;
}

const GENESIS_HASH_RE = /^0x[0-9a-f]{64}$/i;

export function parseNetworkKey(
  value: string | undefined | null,
): NetworkKey | null {
  if (value == null || value === "") return null;
  return (SUPPORTED_NETWORKS as string[]).includes(value)
    ? (value as NetworkKey)
    : null;
}

function assertGenesisHashShape(
  value: string,
  label: string,
): `0x${string}` | "" {
  if (value === "" || GENESIS_HASH_RE.test(value))
    return value as `0x${string}` | "";
  const preview = value.length > 20 ? `${value.slice(0, 20)}…` : value;
  throw new Error(
    `Invalid ${label}: expected 0x + 64 hex chars, got "${preview}"`,
  );
}

function resolvedGenesisHash(override: string | undefined, registryValue: string): string {
  return override != null && override !== "" ? override : registryValue;
}

/** Falls back to the registry value when an override is empty; throws on a malformed hash. */
function applyOverrides(
  network: NetworkConfig,
  overrides: NetworkOverrides,
): NetworkConfig {
  return {
    ...network,
    mainChain: {
      ...network.mainChain,
      genesisHash: assertGenesisHashShape(
        resolvedGenesisHash(overrides.mainGenesisHash, network.mainChain.genesisHash),
        `${network.key} main chain genesis hash`,
      ),
    },
    bulletinChain: network.bulletinChain != null
      ? {
          ...network.bulletinChain,
          genesisHash: assertGenesisHashShape(
            resolvedGenesisHash(overrides.bulletinGenesisHash, network.bulletinChain.genesisHash),
            `${network.key} bulletin chain genesis hash`,
          ),
        }
      : null,
  };
}

/** Empty/undefined key resolves to DEFAULT_NETWORK; an unknown key throws. */
export function resolveNetwork(
  key: string | undefined | null,
  overrides: NetworkOverrides = {},
): NetworkConfig {
  if (key == null || key === "") return applyOverrides(NETWORKS[DEFAULT_NETWORK], overrides);
  const parsed = parseNetworkKey(key);
  if (parsed == null) {
    throw new Error(
      `Unknown network "${key}". Valid values: ${SUPPORTED_NETWORKS.join(", ")}`,
    );
  }
  return applyOverrides(NETWORKS[parsed], overrides);
}
