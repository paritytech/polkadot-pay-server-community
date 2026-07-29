// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createFileRoute } from '@tanstack/react-router';
import { PaymentsPage } from '../../features/payments/components/PaymentsPage';

export const Route = createFileRoute('/payments/')({ component: PaymentsPage });
