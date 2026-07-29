// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { Logger } from "pino";
import type { Database } from "./db/client";
import type { EnvBindings } from "./env";
import type { EventsService } from "./modules/events/events.service";
import type { PaymentsService } from "./modules/payments/payments.service";

export type MerchantRecord = {
  id: string;
  name: string;
  created_at: number;
};

export type ApiKeyRecord = {
  id: string;
  merchant_id: string;
  key_hash: string;
  last4: string;
  label: string | null;
  created_at: number;
  revoked_at: number | null;
};

export type AuthenticatedMerchant = {
  merchant: MerchantRecord;
  apiKey: ApiKeyRecord;
};

export type ChainState = {
  chain: "connected" | "reconnecting";
  pendingSubscriptions: number;
};

export type AppEnv = {
  Bindings: EnvBindings;
  Variables: {
    db: Database;
    merchant: AuthenticatedMerchant;
    logger: Logger;
    requestId: string;
  };
};

export type AppBindings = AppEnv;

export type AppDependencies = {
  db: Database;
  payments: PaymentsService;
  events: EventsService;
  getChainState: () => ChainState;
};
