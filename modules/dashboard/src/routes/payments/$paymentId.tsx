// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createFileRoute } from '@tanstack/react-router';
import { PaymentDetailPage } from '../../features/payments/components/PaymentDetailPage';

export const Route = createFileRoute('/payments/$paymentId')({ component: PaymentDetailRoute });

function PaymentDetailRoute() {
  const { paymentId } = Route.useParams();
  return <PaymentDetailPage paymentId={paymentId} />;
}
