// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Link } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import { Card, PageHeader } from '../../../components/ui';

const REFERENCE_URL = '/docs/reference';

const LINK_CLASS = 'text-link transition-colors hover:text-link-hover';

export function ApiDocsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="API Docs"
        description="Browse every endpoint from the OpenAPI contract and run real requests against this environment."
        actions={
          <a
            href={REFERENCE_URL}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${LINK_CLASS}`}
          >
            Open in a new tab
            <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        }
      />

      <Card aria-labelledby="docs-auth-heading" className="grid gap-3">
        <h2 id="docs-auth-heading" className="text-lg font-semibold text-primary">
          Authorize before you run a request
        </h2>
        <ol className="grid list-decimal gap-2 pl-5 text-sm text-secondary marker:text-tertiary">
          <li>
            Select <span className="font-medium text-primary">Authorize</span> in the reference below and paste an API
            key into the <code className="font-mono text-xs text-primary">bearerAuth</code> (HTTP bearer) field. Create
            or rotate keys on the{' '}
            <Link to="/keys" className={LINK_CLASS}>
              Account &amp; Keys
            </Link>{' '}
            page.
          </li>
          <li>
            Open an endpoint and choose <span className="font-medium text-primary">Try it</span>. Requests execute
            against the same API this dashboard is configured to use, with your{' '}
            <code className="font-mono text-xs text-primary">Authorization: Bearer …</code> header attached.
          </li>
          <li>
            Endpoints tagged <span className="font-medium text-primary">Public</span> need no key; every other route
            answers <span className="font-mono text-xs text-primary">401</span> until you authorize.
          </li>
        </ol>
        <p className="text-xs text-tertiary">
          The dashboard does not store or read this token; manage it from the reference&rsquo;s authorization panel.
        </p>
      </Card>

      <section aria-labelledby="docs-reference-heading" className="grid gap-3">
        <h2 id="docs-reference-heading" className="sr-only">
          Interactive API reference
        </h2>
        <div className="overflow-hidden rounded-container bg-surface-nested shadow-1">
          <iframe
            title="PolkaPay API interactive reference"
            src={REFERENCE_URL}
            className="block h-[calc(100vh-19rem)] min-h-[34rem] w-full border-0"
          />
        </div>
      </section>
    </div>
  );
}
