// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
type RpcState = "connected" | "reconnecting";

type RpcRequest =
  | { kind: "subscribe"; topicHex: string }
  | { kind: "unsubscribe"; topicHex: string; subscriptionId: string };

export type StatementRpcClientOptions = {
  url: string;
  onStatements: (topicHex: string, statements: string[]) => void;
  onStateChange: (state: RpcState) => void;
};

type RpcNotification = {
  subscription: string;
  statements: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function parseNotification(message: unknown): RpcNotification | null {
  if (!isObject(message) || !isObject(message.params)) {
    return null;
  }
  const subscription = asString(message.params.subscription);
  const result = message.params.result;
  if (!subscription || !isObject(result) || !isObject(result.data) || !Array.isArray(result.data.statements)) {
    return null;
  }
  const statements = result.data.statements.filter((value): value is string => typeof value === "string");
  return { subscription, statements };
}

function parseResponse(message: unknown): { id: number; result: unknown; error: unknown } | null {
  if (!isObject(message)) {
    return null;
  }
  const id = asNumber(message.id);
  if (id === null) {
    return null;
  }
  return { id, result: message.result, error: message.error };
}

export class StatementRpcClient {
  private readonly desiredTopics = new Set<string>();
  private readonly subscriptionByTopic = new Map<string, string>();
  private readonly topicBySubscription = new Map<string, string>();
  private readonly pendingRequests = new Map<number, RpcRequest>();
  private readonly inactiveSubscriptions = new Set<string>();
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private nextRequestId = 1;
  private stopped = false;
  private reconnectDelayMs = 1000;

  constructor(private readonly options: StatementRpcClientOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.pendingRequests.clear();
    this.subscriptionByTopic.clear();
    this.topicBySubscription.clear();
    this.inactiveSubscriptions.clear();
    this.socket?.close();
    this.socket = null;
  }

  subscribe(topicHex: string): void {
    this.desiredTopics.add(topicHex);
    if (this.socket?.readyState === WebSocket.OPEN && !this.subscriptionByTopic.has(topicHex)) {
      this.sendSubscribe(topicHex);
    }
  }

  unsubscribe(topicHex: string): void {
    this.desiredTopics.delete(topicHex);
    const subscriptionId = this.subscriptionByTopic.get(topicHex);
    if (!subscriptionId || this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    this.sendUnsubscribe(topicHex, subscriptionId);
  }

  getDesiredSubscriptionCount(): number {
    return this.desiredTopics.size;
  }

  private connect(): void {
    if (this.stopped || this.socket) {
      return;
    }

    this.options.onStateChange("reconnecting");
    const socket = new WebSocket(this.options.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      this.reconnectDelayMs = 1000;
      this.options.onStateChange("connected");
      this.resubscribeAll();
    });

    socket.addEventListener("message", (event) => {
      this.handleMessage(typeof event.data === "string" ? event.data : String(event.data));
    });

    socket.addEventListener("close", () => {
      this.handleDisconnect();
    });

    socket.addEventListener("error", () => {
      this.handleDisconnect();
    });
  }

  private handleDisconnect(): void {
    if (this.socket) {
      this.socket = null;
    }
    this.pendingRequests.clear();
    this.subscriptionByTopic.clear();
    this.topicBySubscription.clear();

    if (this.stopped || this.reconnectTimer) {
      return;
    }

    this.options.onStateChange("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 60_000);
      this.connect();
    }, this.reconnectDelayMs);
  }

  private resubscribeAll(): void {
    for (const topicHex of this.desiredTopics) {
      this.sendSubscribe(topicHex);
    }
  }

  private sendSubscribe(topicHex: string): void {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    this.pendingRequests.set(requestId, { kind: "subscribe", topicHex });
    this.socket?.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "statement_subscribeStatement",
        params: [{ matchAll: [`0x${topicHex}`] }],
      }),
    );
  }

  private sendUnsubscribe(topicHex: string, subscriptionId: string): void {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    this.pendingRequests.set(requestId, { kind: "unsubscribe", topicHex, subscriptionId });
    this.socket?.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: requestId,
        method: "statement_unsubscribeStatement",
        params: [subscriptionId],
      }),
    );
  }

  private handleMessage(raw: string): void {
    const parsed = JSON.parse(raw) as unknown;
    const response = parseResponse(parsed);
    if (response) {
      this.handleResponse(response.id, response.result, response.error);
      return;
    }

    const notification = parseNotification(parsed);
    if (!notification) {
      return;
    }

    const topicHex = this.topicBySubscription.get(notification.subscription);
    if (!topicHex || !this.desiredTopics.has(topicHex)) {
      return;
    }
    this.options.onStatements(topicHex, notification.statements);
  }

  private handleResponse(id: number, result: unknown, error: unknown): void {
    const request = this.pendingRequests.get(id);
    if (!request) {
      return;
    }
    this.pendingRequests.delete(id);

    if (request.kind === "subscribe") {
      const subscriptionId = asString(result);
      if (!subscriptionId || error !== undefined) {
        console.warn(`statement subscribe failed for ${request.topicHex}`);
        return;
      }
      this.subscriptionByTopic.set(request.topicHex, subscriptionId);
      this.topicBySubscription.set(subscriptionId, request.topicHex);
      return;
    }

    if (error !== undefined) {
      this.inactiveSubscriptions.add(request.subscriptionId);
      if (this.inactiveSubscriptions.size > 100) {
        this.socket?.close();
      }
      return;
    }

    this.subscriptionByTopic.delete(request.topicHex);
    this.topicBySubscription.delete(request.subscriptionId);
    this.inactiveSubscriptions.delete(request.subscriptionId);
  }
}
