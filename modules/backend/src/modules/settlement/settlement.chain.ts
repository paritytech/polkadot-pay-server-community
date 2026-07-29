// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Enum, createClient } from "polkadot-api";
import type { PolkadotClient } from "polkadot-api";
import { getPolkadotSigner } from "polkadot-api/signer";
import { getWsProvider } from "polkadot-api/ws";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { entropyToMiniSecret, mnemonicToEntropy, sr25519, ss58Address } from "@polkadot-labs/hdkd-helpers";
import { bytesToNumberLE, numberToBytesLE } from "@noble/curves/utils.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import type { Subscription } from "rxjs";

import { logger } from "../../lib/logger";
import { blake2_256, inheritedImplication } from "./coinage/scale";
import { deriveSettlementAddress } from "./settlement.mnemonic";

const log = logger.child({ component: "settlement_chain" });

const toHex = (bytes: Uint8Array): string => "0x" + Buffer.from(bytes).toString("hex");

async function encodedCallBytes(tx: {
  getEncodedData: () => Promise<{ asBytes?: () => Uint8Array } | Uint8Array>;
}): Promise<Uint8Array> {
  const data = await tx.getEncodedData();
  if (data instanceof Uint8Array) return data;
  if (typeof data.asBytes === "function") return data.asBytes();
  throw new Error("unexpected encoded call shape");
}

/**
 * A mortal era would anchor `CheckEra`'s implicit to a fresh block hash between
 * the payload-capturing pass and submission, invalidating the authorization
 * signature. Immortal pins it to genesis; replay is not a concern because the
 * transfer consumes the coin.
 */
const IMMORTAL = { mortal: false } as const;

/**
 * FRAME `ImplicationParts` for the extension at pipeline position 0, which
 * encodes as `base ++ explicit ++ implicit` where `base` is
 * `TxBaseImplication((extension_version, call))`. `signingPayload` is the
 * classic payload polkadot-api signs (`call ++ every explicit ++ every
 * implicit`), so dropping the byte at `callBytes.length` removes this
 * extension's own explicit and leaves the following extensions' data — taking
 * spec version, transaction version, genesis, era and tip straight from
 * polkadot-api instead of reproducing them.
 */
export function valueTransferImplication(
  callBytes: Uint8Array,
  signingPayload: Uint8Array,
): Uint8Array {
  const following = signingPayload.subarray(callBytes.length + 1);
  const out = new Uint8Array(1 + callBytes.length + following.length);
  out.set(callBytes, 1);
  out.set(following, 1 + callBytes.length);
  return out;
}

/** ed25519 signature over `blake2_256` of the position-0 inherited implication; `undefined` (=> `None`) is rejected with `System.CallFiltered`. */
export function buildAuthorizeValueTransfer(
  authorizationKey: Uint8Array | undefined,
  implication: Uint8Array,
): string | undefined {
  if (!authorizationKey) return undefined;
  return toHex(ed25519.sign(blake2_256(implication), authorizationKey));
}

const COINAGE_ORIGIN_EXTENSIONS = {
  VerifyMultiSignature: { value: Enum("Disabled") },
  AsPerson: { value: undefined },
  AsProofOfInkParticipant: { value: undefined },
  ScoreAsParticipant: { value: undefined },
  GameAsInvited: { value: undefined },
  PeopleLiteAuth: { value: undefined },
  AsMember: { value: undefined },
  AsCoinage: { value: Enum("AsCoin") },
  AsResources: { value: undefined },
  HonourAuth: { value: undefined },
  AuthorizeCall: { value: undefined },
  RestrictOrigins: { value: true },
};

/**
 * A payment coin arrives as a 64-byte schnorrkel "canonical" sr25519 secret
 * (32-byte canonical scalar ‖ 32-byte nonce). schnorrkel stores the scalar in
 * canonical (÷8 cofactor) form, but the hdkd-helpers sr25519 backend — the same
 * one the payer's host and the Coinage pallet use — expects the ed25519 (×8)
 * scalar form. Recover it exactly as the host signer does (product-sdk
 * terminal/host-signer.ts) so our derived public key and signatures match the
 * account the chain recorded in Coinage.CoinsByOwner.
 */
function coinSecretToEd25519Bytes(coinSecret: Uint8Array): Uint8Array {
  const scalar = numberToBytesLE(bytesToNumberLE(coinSecret.subarray(0, 32)) << 3n, 32);
  const ed = new Uint8Array(64);
  ed.set(scalar, 0);
  ed.set(coinSecret.subarray(32, 64), 32);
  return ed;
}

/** Hook failures are diagnostics, never a reason to fail or retry a transfer that already landed. */
async function runHook<A extends unknown[]>(
  name: string,
  hook: ((...args: A) => void | Promise<void>) | undefined,
  ...args: A
): Promise<void> {
  if (!hook) return;
  try {
    await hook(...args);
  } catch (err) {
    log.error({ event: "settlement_coin_transfer_hook_failed", hook: name, err });
  }
}

export type CoinTransferResult = { status: "transferred"; txHash: string | null };

/** Observers for a transfer from signing through finalization. */
export type CoinTransferHooks = {
  /**
   * Fired pre-inclusion — the PAPI `signed` event reports the tx hash as
   * soon as the signer hands the payload to the client (before broadcast,
   * best-block, or finalization). Same hash every subsequent event carries.
   * MUST NOT change payment status; it is purely informational and used
   * to surface the hash to callers (e.g. claim orchestration) ahead of
   * the ~26s GRANDPA-lag interval to inclusion.
   */
  onSubmitted?: (txHash: string) => void | Promise<void>;
  /** The extrinsic is in a best block and dispatched successfully. Fires before the promise resolves. */
  onIncluded?: (txHash: string) => void | Promise<void>;
  /** The including block was finalized. Purely confirmatory. */
  onFinalized?: (txHash: string) => void | Promise<void>;
  /** The transfer was included but never finalized — reorged out, reverted, or the watch died. Must be replayed. */
  onDropped?: (txHash: string, reason: string) => void | Promise<void>;
};

export type CoinDisposition = "source" | "purse" | "missing";

export interface SettlementChain {
  readonly destinationAddress: string;
  /** The on-chain account a coin secret controls — the `Coinage.CoinsByOwner` key. */
  coinAddress(coinSecret: Uint8Array): string;
  /** True when the coin still exists on-chain (owned, unspent) and can be claimed. */
  coinPresent(coinSecret: Uint8Array): Promise<boolean>;
  /**
   * Where the coin currently lives: `source` (still at the payer-minted
   * account, claimable), `purse` (already held by our per-coin settlement
   * purse — a prior transfer landed), or `missing` (absent from both —
   * consumed by a third party; unrecoverable).
   */
  coinDisposition(coinSecret: Uint8Array): Promise<CoinDisposition>;
  /**
   * Claims the coin into a settlement-controlled purse account via
   * `Coinage.transfer` under an AsCoin origin — the RFC-0006 top-up: it moves
   * the bearer coin to a key only we control (re-derivable from the settlement
   * mnemonic), preventing double-spend. Throws on dispatch failure.
   *
   * Resolves at **inclusion**, not finalization. GRANDPA on the People chain
   * trails the best block by ~12 blocks (minutes, when block production
   * stalls), and blocking on it stalled the merchant-visible lifecycle for
   * ~4 minutes per payment while outliving the settlement job lock. Inclusion
   * is the honest signal: the coin is ours in either outcome, so a reorg only
   * means the sweep must be replayed — which `onDropped` reports.
   *
   * If inclusion never arrives within `options.inclusionTimeoutMs`, the
   * subscription is released and the coin is reconciled: only this service
   * holds the coin's secret, so a missing `Coinage.CoinsByOwner` entry proves
   * the transfer landed and the promise resolves with `txHash: null`;
   * otherwise it rejects with a timeout error so the claim worker retries.
   */
  transferCoin(coinSecret: Uint8Array, hooks?: CoinTransferHooks): Promise<CoinTransferResult>;
  close(): Promise<void>;
}

export function createSettlementChain(options: {
  rpcUrl: string;
  mnemonic: string;
  accountPath: string;
  /** People-chain value-transfer authorization seed (32-byte ed25519); see `buildAuthorizeValueTransfer`. */
  authorizationKey?: Uint8Array;
  /**
   * Hard upper bound on how long `transferCoin` waits for inclusion before
   * reconciling against chain state — without it a quiet `signSubmitAndWatch`
   * stalls the claim worker forever and freezes every later payment.
   */
  inclusionTimeoutMs?: number;
}): SettlementChain {
  const inclusionTimeoutMs = options.inclusionTimeoutMs ?? 60_000;
  const destinationAddress = deriveSettlementAddress(options.mnemonic, options.accountPath);
  const derive = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(options.mnemonic)));
  let client: PolkadotClient | null = null;
  /** Finality watchers outlive the transfers that spawned them; `close` must not leak them. */
  const finalityWatchers = new Set<Subscription>();

  const api = () => {
    try {
      if (!client) {
        client = createClient(getWsProvider(options.rpcUrl));
        log.info({ event: "settlement_chain_connection_initialized", destinationAddress });
      }
      return client.getUnsafeApi();
    } catch (err) {
      log.error({ event: "settlement_chain_connection_failed", destinationAddress, err });
      throw err;
    }
  };

  const coinExists = async (coinAddress: string): Promise<boolean> => {
    try {
      const existing = await api().query.Coinage.CoinsByOwner.getValue(coinAddress, { at: "best" });
      const present = existing !== undefined;
      log.debug({ event: "settlement_coin_presence_checked", coinAddress, present });
      return present;
    } catch (err) {
      log.error({ event: "settlement_coin_presence_check_failed", coinAddress, err });
      throw err;
    }
  };

  /** A fresh settlement-owned account per coin, so no destination ever holds two coins. */
  const purseAccountFor = (coinPublicKey: Uint8Array): string =>
    ss58Address(
      derive(`${options.accountPath}//purse//${Buffer.from(coinPublicKey.subarray(0, 15)).toString("hex")}`).publicKey,
    );

  return {
    destinationAddress,
    coinAddress(coinSecret) {
      return ss58Address(sr25519.getPublicKey(coinSecretToEd25519Bytes(coinSecret)));
    },

    async coinPresent(coinSecret) {
      return coinExists(ss58Address(sr25519.getPublicKey(coinSecretToEd25519Bytes(coinSecret))));
    },

    async coinDisposition(coinSecret) {
      const coinPublicKey = sr25519.getPublicKey(coinSecretToEd25519Bytes(coinSecret));
      if (await coinExists(ss58Address(coinPublicKey))) return "source";
      if (await coinExists(purseAccountFor(coinPublicKey))) return "purse";
      return "missing";
    },

    async transferCoin(coinSecret, hooks) {
      const ed25519Secret = coinSecretToEd25519Bytes(coinSecret);
      const coinPublicKey = sr25519.getPublicKey(ed25519Secret);
      const coinAddress = ss58Address(coinPublicKey);
      const to = purseAccountFor(coinPublicKey);
      log.info({ event: "settlement_coin_transfer_started", coinAddress, to });
      try {
        const tx = api().tx.Coinage.transfer({ to });
        const callBytes = await encodedCallBytes(tx);
        const extensions = (authorization: string | undefined) => ({
          ...COINAGE_ORIGIN_EXTENSIONS,
          AuthorizeValueTransfer: { value: authorization },
        });

        let signingPayload: Uint8Array | undefined;
        const capturingSigner = getPolkadotSigner(coinPublicKey, "Sr25519", (input) => {
          signingPayload = input;
          return sr25519.sign(input, ed25519Secret);
        });
        await tx.sign(capturingSigner, {
          mortality: IMMORTAL,
          customSignedExtensions: extensions(undefined),
        });
        if (!signingPayload) throw new Error("signing payload was not captured");

        const submitOptions = {
          mortality: IMMORTAL,
          customSignedExtensions: extensions(
            buildAuthorizeValueTransfer(
              options.authorizationKey,
              valueTransferImplication(callBytes, signingPayload),
            ),
          ),
        };
        const signer = getPolkadotSigner(coinPublicKey, "Sr25519", (input) =>
          sr25519.sign(input, ed25519Secret),
        );
        const txHash = await new Promise<string | null>((resolve, reject) => {
          let subscription: Subscription | null = null;
          let submittedTxHash: string | null = null;
          let includedTxHash: string | null = null;
          /**
           * Synchronous flag — set the moment any path (txBestBlocksState
           * `found: false`, finalized `ok: false`, watcher error) determines
           * the just-included tx is gone, BEFORE any await. A late
           * `onIncluded` continuation that returns from its hook after the
           * drop must observe this flag and reject instead of resolving the
           * inclusion promise; otherwise the caller sees a successful
           * settlement while the DB-recovery `onDropped` callback has
           * already opened the state for replay.
           */
          let dropped = false;
          let watchClosed = false;
          let promiseSettled = false;
          let timer: NodeJS.Timeout | null = null;

          const clearInclusionTimer = (): void => {
            if (timer === null) return;
            clearTimeout(timer);
            timer = null;
          };
          const closeWatch = (): void => {
            if (watchClosed) return;
            watchClosed = true;
            clearInclusionTimer();
            if (!subscription) return;
            finalityWatchers.delete(subscription);
            subscription.unsubscribe();
            subscription = null;
          };
          const settleResolve = (value: string | null): void => {
            if (promiseSettled) return;
            promiseSettled = true;
            resolve(value);
          };
          const settleReject = (err: Error): void => {
            if (promiseSettled) return;
            promiseSettled = true;
            reject(err);
          };
          const dropIncluded = async (reason: string): Promise<void> => {
            const droppedTxHash = includedTxHash;
            dropped = true;
            closeWatch();
            if (droppedTxHash) {
              if (!promiseSettled) {
                settleReject(new Error(reason));
              }
              await runHook("onDropped", hooks?.onDropped, droppedTxHash, reason);
              return;
            }
            settleReject(new Error(reason));
          };

          subscription = tx.signSubmitAndWatch(signer, submitOptions).subscribe({
            next: async (event) => {
              if (watchClosed) return;
              if (event.type === "signed") {
                if (submittedTxHash) return;
                submittedTxHash = event.txHash;
                log.info({ event: "settlement_coin_transfer_signed", coinAddress, to, txHash: event.txHash });
                await runHook("onSubmitted", hooks?.onSubmitted, event.txHash);
                return;
              }
              if (event.type === "txBestBlocksState") {
                if (!event.found) {
                  if (includedTxHash) {
                    await dropIncluded("coin transfer dropped from the best-block chain");
                  }
                  return;
                }
                if (!event.ok) {
                  closeWatch();
                  settleReject(new Error(`coin transfer dispatch failed: ${JSON.stringify(event.dispatchError)}`));
                  return;
                }
                if (includedTxHash) return;
                includedTxHash = event.txHash;
                clearInclusionTimer();
                log.info({ event: "settlement_coin_transfer_included", coinAddress, to, txHash: event.txHash });
                await runHook("onIncluded", hooks?.onIncluded, event.txHash);
                if (dropped) {
                  settleReject(new Error("coin transfer dropped before inclusion could resolve"));
                  return;
                }
                settleResolve(event.txHash);
                return;
              }
              if (event.type !== "finalized") return;

              if (!event.ok) {
                const reason = `coin transfer reverted on finalization: ${JSON.stringify(event.dispatchError)}`;
                log.error({
                  event: "settlement_coin_transfer_reverted",
                  coinAddress,
                  to,
                  txHash: event.txHash,
                  dispatchError: event.dispatchError,
                });
                await dropIncluded(reason);
                return;
              }

              if (!includedTxHash) {
                includedTxHash = event.txHash;
                await runHook("onIncluded", hooks?.onIncluded, event.txHash);
                if (dropped) {
                  settleReject(new Error("coin transfer dropped before inclusion could resolve"));
                  return;
                }
                settleResolve(event.txHash);
              }
              closeWatch();
              log.info({ event: "settlement_coin_transfer_completed", coinAddress, to, txHash: event.txHash });
              await runHook("onFinalized", hooks?.onFinalized, event.txHash);
            },
            error: async (err) => {
              if (watchClosed) return;
              const reason = err instanceof Error ? err.message : String(err);
              log.error({
                event: "settlement_coin_transfer_watch_failed",
                coinAddress,
                to,
                included: includedTxHash !== null,
                err,
              });
              await dropIncluded(reason);
            },
          });
          if (watchClosed) subscription.unsubscribe();
          else finalityWatchers.add(subscription);

          if (!promiseSettled) {
            timer = setTimeout(() => {
              timer = null;
              if (promiseSettled) return;
              closeWatch();
              log.error({
                event: "settlement_coin_transfer_inclusion_timeout",
                coinAddress,
                to,
                timeoutMs: inclusionTimeoutMs,
                txHash: submittedTxHash,
              });
              settleReject(new Error(`coin transfer not included within ${inclusionTimeoutMs}ms`));
            }, inclusionTimeoutMs);
          }
        });
        return { status: "transferred", txHash };
      } catch (err) {
        log.error({ event: "settlement_coin_transfer_failed", coinAddress, to, err });
        throw err;
      }
    },

    async close() {
      for (const watcher of finalityWatchers) watcher.unsubscribe();
      finalityWatchers.clear();
      if (!client) return;
      try {
        client.destroy();
        client = null;
        log.info({ event: "settlement_chain_connection_closed", destinationAddress });
      } catch (err) {
        log.error({ event: "settlement_chain_close_failed", destinationAddress, err });
        throw err;
      }
    },
  };
}
