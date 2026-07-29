// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { describe, expect, it } from "bun:test";

import { StatementRpcClient } from "../src/modules/payments/v1/listener/rpc-client.ts";

describe("StatementRpcClient", () => {
  it("routes notifications for a subscribed topic", async () => {
    const received: Array<{ topicHex: string; statements: string[] }> = [];
    const peerReady = Promise.withResolvers<{ send: (payload: string) => void }>();
    const subscribed = Promise.withResolvers<void>();
    const notified = Promise.withResolvers<void>();
    const subscriptionId = "sub-1";
    const server = Bun.serve({
      port: 10094,
      fetch(req, serverInstance) {
        if (serverInstance.upgrade(req)) return undefined;
        return new Response("ws only", { status: 426 });
      },
      websocket: {
        message(ws, raw) {
          peerReady.resolve({ send: (payload) => ws.send(payload) });
          const message = JSON.parse(String(raw));
          if (message.method === "statement_subscribeStatement") {
            ws.send(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: subscriptionId }));
            subscribed.resolve();
          }
        },
      },
    });

    const client = new StatementRpcClient({
      url: "ws://127.0.0.1:10094",
      onStatements: (topicHex, statements) => {
        received.push({ topicHex, statements });
        notified.resolve();
      },
      onStateChange: () => {},
    });

    client.start();
    client.subscribe("abcd");
    const peer = await peerReady.promise;
    peer.send(
      JSON.stringify({
        jsonrpc: "2.0",
        params: { subscription: subscriptionId, result: { data: { statements: ["0x1234"] } } },
      }),
    );
    await notified.promise;

    client.stop();
    server.stop(true);

    expect(received).toEqual([{ topicHex: "abcd", statements: ["0x1234"] }]);
  });

  it("reconnects and re-subscribes after a connection drop", async () => {
    let subscribeCount = 0;
    let firstSocketClosed = false;
    const reconnected = Promise.withResolvers<void>();
    const states: string[] = [];
    const server = Bun.serve({
      port: 10095,
      fetch(req, serverInstance) {
        if (serverInstance.upgrade(req)) return undefined;
        return new Response("ws only", { status: 426 });
      },
      websocket: {
        message(ws, raw) {
          const message = JSON.parse(String(raw));
          if (message.method === "statement_subscribeStatement") {
            subscribeCount += 1;
            ws.send(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: `sub-${subscribeCount}` }));
            if (!firstSocketClosed) {
              firstSocketClosed = true;
              ws.close();
            } else {
              reconnected.resolve();
            }
          }
        },
      },
    });

    const client = new StatementRpcClient({
      url: "ws://127.0.0.1:10095",
      onStatements: () => {},
      onStateChange: (state) => {
        states.push(state);
      },
    });

    client.start();
    client.subscribe("feed");
    await reconnected.promise;

    client.stop();
    server.stop(true);

    expect(subscribeCount).toBeGreaterThanOrEqual(2);
    expect(states).toContain("connected");
    expect(states).toContain("reconnecting");
  });
});
