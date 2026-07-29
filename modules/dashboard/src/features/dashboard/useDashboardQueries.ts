// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useQuery } from '@tanstack/react-query';
import { paymentsQueryOptions } from '../payments/api/paymentQueries';
import { eventsQueryOptions, webhooksQueryOptions } from '../webhooks/api/webhookQueries';

export function useDashboardQueries() {
  const payments = useQuery({
    ...paymentsQueryOptions({}),
    refetchInterval: (query) => {
      const items = query.state.data?.data ?? [];
      return items.some((item) => ['pending', 'received', 'settling', 'confirming'].includes(item.status))
        ? 5000
        : false;
    },
  });
  const webhooks = useQuery(webhooksQueryOptions);
  const events = useQuery(eventsQueryOptions);

  return { payments, webhooks, events };
}
