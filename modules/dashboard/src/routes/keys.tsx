// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createFileRoute } from '@tanstack/react-router';
import { AccountKeysPage } from '../features/account/components/AccountKeysPage';

export const Route = createFileRoute('/keys')({ component: AccountKeysPage });
