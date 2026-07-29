// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { useQuery } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { EmptyState, PageHeader, Spinner } from '../../../components/ui';
import { accountQueryOptions, apiKeysQueryOptions } from '../api/accountQueries';
import { AccountCard } from './AccountCard';
import { KeysSection } from './KeysSection';

export function AccountKeysPage() {
  const accountQuery = useQuery(accountQueryOptions);
  const keysQuery = useQuery(apiKeysQueryOptions);
  const isLoading = accountQuery.isPending || keysQuery.isPending;
  const hasError = accountQuery.isError || keysQuery.isError || !accountQuery.data || !keysQuery.data;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Account & Keys"
        description="Your merchant details, and the secret keys your servers send as a bearer token on every request."
      />

      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner />
        </div>
      ) : hasError ? (
        <EmptyState
          icon={KeyRound}
          title="Unable to load account"
          description="Refresh the page to try again."
        />
      ) : (
        <>
          <section className="grid gap-4">
            <h2 className="text-lg font-semibold leading-tight text-primary">Merchant</h2>
            <AccountCard merchant={accountQuery.data} />
          </section>
          <KeysSection keys={keysQuery.data.data} />
        </>
      )}
    </div>
  );
}
