// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createFileRoute } from '@tanstack/react-router';
import { WebhooksPage } from '../features/webhooks/components/WebhooksPage';

export const Route = createFileRoute('/webhooks')({ component: WebhooksPage });
