// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { describe, expect, it } from "bun:test";
import { DEFAULT_NETWORK, NETWORKS, parseNetworkKey, resolveNetwork, type ChainEndpoint } from "../src/lib/networks.ts";

const endpointWithoutRegistryGenesis = {
  wsUrl: "wss://example.invalid",
  genesisHash: "",
} satisfies ChainEndpoint;

describe("network resolver", () => {
  it("pins the supplied registry values", () => {
    expect(NETWORKS).toEqual({
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
    });
    expect(endpointWithoutRegistryGenesis.genesisHash).toBe("");
  });

  it("parses supported keys and returns null for empty or unknown values", () => {
    expect(parseNetworkKey("paseo-next-v2")).toBe("paseo-next-v2");
    expect(parseNetworkKey("")).toBeNull();
    expect(parseNetworkKey(undefined)).toBeNull();
    expect(parseNetworkKey(null)).toBeNull();
    expect(parseNetworkKey("unknown")).toBeNull();
  });

  it("defaults null, undefined, and empty keys", () => {
    expect(resolveNetwork(null)).toEqual(NETWORKS[DEFAULT_NETWORK]);
    expect(resolveNetwork(undefined)).toEqual(NETWORKS[DEFAULT_NETWORK]);
    expect(resolveNetwork("")).toEqual(NETWORKS[DEFAULT_NETWORK]);
  });

  it("rejects unknown keys with the valid values", () => {
    expect(() => resolveNetwork("unknown")).toThrow('Unknown network "unknown". Valid values: paseo, paseo-next-v2, previewnet');
  });

  it("applies valid genesis overrides and falls back for empty overrides", () => {
    const mainGenesisHash = `0x${"a".repeat(64)}`;
    const bulletinGenesisHash = `0x${"b".repeat(64)}`;
    expect(resolveNetwork("paseo-next-v2", { mainGenesisHash, bulletinGenesisHash })).toMatchObject({
      mainChain: { genesisHash: mainGenesisHash },
      bulletinChain: { genesisHash: bulletinGenesisHash },
    });
    expect(resolveNetwork("paseo-next-v2", { mainGenesisHash: "", bulletinGenesisHash: "" })).toEqual(NETWORKS["paseo-next-v2"]);
  });

  it("rejects malformed non-empty overrides and previews their values", () => {
    expect(() => resolveNetwork("paseo-next-v2", { mainGenesisHash: "not-a-genesis-hash" })).toThrow(
      'Invalid paseo-next-v2 main chain genesis hash: expected 0x + 64 hex chars, got "not-a-genesis-hash"',
    );
    expect(() => resolveNetwork("paseo-next-v2", { bulletinGenesisHash: `0x${"g".repeat(64)}` })).toThrow(
      'Invalid paseo-next-v2 bulletin chain genesis hash: expected 0x + 64 hex chars, got "0xgggggggggggggggggg…"',
    );
  });
});
