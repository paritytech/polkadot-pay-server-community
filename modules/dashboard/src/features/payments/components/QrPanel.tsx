// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import type { Payment } from '../../../types/api';
import { Card, CodeBlock, CopyButton } from '../../../components/ui';
import { formatCurrency } from '../../../lib/utils';

export function QrPanel({ payment }: { payment: Payment }) {
  return (
    <Card className="grid justify-items-center gap-4 text-center">
      <img
        src={payment.qr.svg}
        alt={`Scan to pay ${payment.amount} ${formatCurrency(payment.currency)}`}
        className="h-56 w-56 rounded-nested bg-static-white p-2"
      />
      <div className="grid w-full max-w-md gap-2">
        <div className="flex min-w-0 items-center justify-center gap-2 text-sm text-secondary">
          <span className="min-w-0 truncate font-mono text-primary" title={payment.payment_url}>
            {payment.payment_url}
          </span>
          <CopyButton value={payment.payment_url} label="Copy link" />
        </div>
        <a
          href={payment.payment_url}
          target="_blank"
          rel="noreferrer"
          className="cursor-pointer text-sm text-link transition-colors hover:text-link-hover"
        >
          Open checkout
        </a>
      </div>
      <div className="w-full min-w-0 text-left">
        <CodeBlock code={payment.qr.deeplink} label="Wallet deeplink" truncate />
      </div>
    </Card>
  );
}
