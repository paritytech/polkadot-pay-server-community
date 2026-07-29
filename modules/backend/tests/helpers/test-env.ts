// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
/**
 * Test-only environment bootstrap.
 *
 * Loaded before any source module so SIGNUP_CODE is present before `src/env.ts`
 * evaluates. Production deployments fail to boot when SIGNUP_CODE is missing or
 * empty; tests need a deterministic value to instantiate the app without pulling
 * secrets out of the ambient test runner environment.
 */
Bun.env.SIGNUP_CODE ??= "test-signup-code";
