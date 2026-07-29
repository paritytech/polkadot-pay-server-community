// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { PageHeader } from '../../../components/ui';
import { DeliveriesTable } from './DeliveriesTable';
import { EndpointsSection } from './EndpointsSection';

export function WebhooksPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Webhooks"
        description="We POST a signed JSON event to your endpoints when a payment changes state, and retry failures with backoff for up to 3 days."
      />
      <EndpointsSection />
      <DeliveriesTable />
    </div>
  );
}