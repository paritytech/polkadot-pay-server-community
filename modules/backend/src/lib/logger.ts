// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "payment-processor-api" },
});
