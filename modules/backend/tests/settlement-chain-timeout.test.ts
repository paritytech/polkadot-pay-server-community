// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { afterEach, beforeEach, describe, expect, it, jest, mock } from "bun:test";
import type { Observable } from "rxjs";
import { Subject } from "rxjs";

import { COIN_SECRET_BYTES } from "../src/modules/payments/v1/wire/codec.ts";

type WatchEvent =
  | { type: "signed"; txHash: string }
  | { type: "txBestBlocksState"; found: false; isValid: boolean; txHash: string }
  | { type: "txBestBlocksState"; found: true; ok: boolean; txHash: string; dispatchError?: unknown }
  | { type: "finalized"; ok: boolean; txHash: string; dispatchError?: unknown };

interface Signer {
  sign: (input: Uint8Array) => Uint8Array;
}

interface CoinageTx {
  getEncodedData: () => Promise<{ asBytes: () => Uint8Array } | Uint8Array>;
  sign: (signer: Signer, options: unknown) => Promise<unknown>;
  signSubmitAndWatch: (signer: Signer, options: unknown) => Observable<WatchEvent>;
}

interface CoinageApi {
  query: { Coinage: { CoinsByOwner: { getValue: (address: string, options?: unknown) => Promise<unknown> } } };
  tx: { Coinage: { transfer: (args: { to: string }) => CoinageTx } };
}

interface Fakes {
  setCoinPresence: (response: unknown) => void;
  presenceCalls: () => number;
  lastPresenceOptions: () => unknown;
  resetCallCount: () => void;
  awaitSubject: () => Promise<Subject<WatchEvent>>;
}

const FAKE_PAYLOAD = new Uint8Array([0xaa, 0xbb]);

function installFakes(): Fakes {
  let coinExistsResponse: unknown = undefined;
  let getValueCallCount = 0;
  let getValueOptions: unknown;
  let subjectResolver: ((subject: Subject<WatchEvent>) => void) | undefined;

  const fakeApi: CoinageApi = {
    query: {
      Coinage: {
        CoinsByOwner: {
          async getValue(_address: string, options?: unknown): Promise<unknown> {
            getValueCallCount += 1;
            getValueOptions = options;
            return coinExistsResponse;
          },
        },
      },
    },
    tx: {
      Coinage: {
        transfer(_args: { to: string }): CoinageTx {
          return {
            async getEncodedData(): Promise<{ asBytes: () => Uint8Array }> {
              return { asBytes: () => new Uint8Array([0x42]) };
            },
            async sign(signer: Signer): Promise<unknown> {
              signer.sign(FAKE_PAYLOAD);
              return undefined;
            },
            signSubmitAndWatch(): Observable<WatchEvent> {
              const subject = new Subject<WatchEvent>();
              subjectResolver?.(subject);
              return subject.asObservable();
            },
          };
        },
      },
    },
  };

  const fakeClient = {
    getUnsafeApi(): CoinageApi {
      return fakeApi;
    },
    destroy(): void {},
  };

  mock.module("polkadot-api", () => ({
    createClient: () => fakeClient,
    Enum: (name: string) => ({ kind: name }),
  }));

  mock.module("polkadot-api/signer", () => ({
    getPolkadotSigner: (_publicKey: unknown, _alg: string, sign: (input: Uint8Array) => Uint8Array): Signer => ({
      sign: (input: Uint8Array): Uint8Array => sign(input),
    }),
  }));

  mock.module("polkadot-api/ws", () => ({
    getWsProvider: () => ({ url: "ws://fake" }),
  }));

  return {
    setCoinPresence(response): void {
      coinExistsResponse = response;
    },
    presenceCalls(): number {
      return getValueCallCount;
    },
    lastPresenceOptions(): unknown {
      return getValueOptions;
    },
    resetCallCount(): void {
      getValueCallCount = 0;
    },
    awaitSubject(): Promise<Subject<WatchEvent>> {
      const { promise, resolve } = Promise.withResolvers<Subject<WatchEvent>>();
      subjectResolver = resolve;
      return promise;
    },
  };
}

const fakes = installFakes();

const { createSettlementChain } = await import("../src/modules/settlement/settlement.chain.ts");

function makeCoinSecret(): Uint8Array {
  const bytes = new Uint8Array(COIN_SECRET_BYTES);
  for (let index = 0; index < COIN_SECRET_BYTES; index++) bytes[index] = index & 0x01;
  return bytes;
}

const COIN = makeCoinSecret();
const INCLUSION_TIMEOUT_MS = 50;
const INCLUDED_TX_HASH = "0xfeedface";

const MNEMONIC = "test test test test test test test test test test test junk";
const ACCOUNT_PATH = "//test";

interface StartTransfer {
  result: ReturnType<ReturnType<typeof createSettlementChain>["transferCoin"]>;
  subject: Subject<WatchEvent>;
}
async function startTransfer(hooks?: {
  onSubmitted?: (txHash: string) => void | Promise<void>;
  onIncluded?: (txHash: string) => void | Promise<void>;
  onFinalized?: (txHash: string) => void | Promise<void>;
  onDropped?: (txHash: string, reason: string) => void | Promise<void>;
}): Promise<StartTransfer> {
  const chain = createSettlementChain({
    rpcUrl: "ws://fake",
    mnemonic: MNEMONIC,
    accountPath: ACCOUNT_PATH,
    inclusionTimeoutMs: INCLUSION_TIMEOUT_MS,
  });
  const result = chain.transferCoin(COIN, hooks);
  const subject = await fakes.awaitSubject();
  return { result, subject };
}

describe("createSettlementChain — inclusion timeout reconciliation", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    fakes.setCoinPresence(undefined);
    fakes.resetCallCount();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("rejects a quiet subscription without inferring success from coin absence", async () => {
    fakes.setCoinPresence(undefined);
    const { result, subject } = await startTransfer();

    jest.advanceTimersByTime(INCLUSION_TIMEOUT_MS + 1);
    await expect(result).rejects.toThrow(/coin transfer not included within \d+ms/);
    expect(fakes.presenceCalls()).toBe(0);

    subject.complete();
  });


  it("resolves with the real txHash on inclusion before the deadline and the timer is a no-op", async () => {
    fakes.setCoinPresence({ owner: "irrelevant" });
    const onIncluded = mock((_txHash: string): void => {});
    const { result, subject } = await startTransfer({ onIncluded });

    subject.next({
      type: "txBestBlocksState",
      found: true,
      ok: true,
      txHash: INCLUDED_TX_HASH,
    });

    expect(await result).toEqual({ status: "transferred", txHash: INCLUDED_TX_HASH });
    expect(onIncluded).toHaveBeenCalledWith(INCLUDED_TX_HASH);

    jest.advanceTimersByTime(INCLUSION_TIMEOUT_MS + 1);
    await Promise.resolve();
    await Promise.resolve();
    expect(fakes.presenceCalls()).toBe(0);
  });
  it("queries coin presence at the best block instead of waiting for finality", async () => {
    fakes.setCoinPresence({ owner: "ready" });
    const chain = createSettlementChain({
      rpcUrl: "ws://fake",
      mnemonic: MNEMONIC,
      accountPath: ACCOUNT_PATH,
      inclusionTimeoutMs: INCLUSION_TIMEOUT_MS,
    });

    expect(await chain.coinPresent(COIN)).toBe(true);
    expect(fakes.lastPresenceOptions()).toEqual({ at: "best" });
    await chain.close();
  });

  it("surfaces the signed hash before inclusion and keeps watching through finalization", async () => {
    const inclusionGate = Promise.withResolvers<void>();
    const onSubmitted = mock((_txHash: string): void => {});
    const onFinalized = mock((_txHash: string): void => {});
    const { result, subject } = await startTransfer({
      onSubmitted,
      onIncluded: () => inclusionGate.promise,
      onFinalized,
    });

    subject.next({ type: "signed", txHash: INCLUDED_TX_HASH });
    await Promise.resolve();
    expect(onSubmitted).toHaveBeenCalledWith(INCLUDED_TX_HASH);

    let resolved = false;
    void result.then(() => {
      resolved = true;
    });
    subject.next({
      type: "txBestBlocksState",
      found: true,
      ok: true,
      txHash: INCLUDED_TX_HASH,
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    inclusionGate.resolve();
    expect(await result).toEqual({ status: "transferred", txHash: INCLUDED_TX_HASH });

    subject.next({ type: "finalized", ok: true, txHash: INCLUDED_TX_HASH });
    await Promise.resolve();
    expect(onFinalized).toHaveBeenCalledWith(INCLUDED_TX_HASH);
  });

  it("reports a transfer dropped from the best chain after inclusion", async () => {
    const onDropped = mock((_txHash: string, _reason: string): void => {});
    const { result, subject } = await startTransfer({ onDropped });
    subject.next({ type: "signed", txHash: INCLUDED_TX_HASH });
    subject.next({
      type: "txBestBlocksState",
      found: true,
      ok: true,
      txHash: INCLUDED_TX_HASH,
    });
    await result;

    subject.next({
      type: "txBestBlocksState",
      found: false,
      isValid: true,
      txHash: INCLUDED_TX_HASH,
    });
    await Promise.resolve();
    expect(onDropped).toHaveBeenCalledWith(
      INCLUDED_TX_HASH,
      "coin transfer dropped from the best-block chain",
    );
  });

  it("rejects the inclusion promise and fires onDropped once when a best-block drop arrives before onIncluded releases", async () => {
    const inclusionGate = Promise.withResolvers<void>();
    let onDroppedCalls = 0;
    const onDropped = mock((_txHash: string, _reason: string): void => {
      onDroppedCalls += 1;
    });
    const { result, subject } = await startTransfer({
      onDropped,
      onIncluded: () => inclusionGate.promise,
    });

    subject.next({ type: "signed", txHash: INCLUDED_TX_HASH });
    subject.next({
      type: "txBestBlocksState",
      found: true,
      ok: true,
      txHash: INCLUDED_TX_HASH,
    });
    await Promise.resolve();
    await Promise.resolve();

    subject.next({
      type: "txBestBlocksState",
      found: false,
      isValid: true,
      txHash: INCLUDED_TX_HASH,
    });
    await Promise.resolve();
    await Promise.resolve();

    inclusionGate.resolve();

    let resolved = false;
    void result.then(
      (value) => {
        resolved = true;
        throw new Error(`expected rejection, got ${JSON.stringify(value)}`);
      },
      () => {},
    );

    await expect(result).rejects.toThrow(/coin transfer dropped from the best-block chain/);
    expect(resolved).toBe(false);
    expect(onDroppedCalls).toBe(1);
    expect(onDropped).toHaveBeenCalledWith(
      INCLUDED_TX_HASH,
      "coin transfer dropped from the best-block chain",
    );
  });
});
