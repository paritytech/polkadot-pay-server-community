// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router';
import { AppShell } from '../components/AppShell';
import { AuthGate } from '../components/AuthGate';
import { Toaster } from '../components/ui';
import { useAuthStore } from '../stores/authStore';

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  const isSignedIn = useAuthStore((s) => s.isSignedIn);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isDocsPage = pathname === '/docs';
  const content = <Outlet />;

  if (isDocsPage) {
    return (
      <>
        <main className="min-h-full bg-surface-main">
          <div className="mx-auto max-w-5xl px-4 py-4">{content}</div>
        </main>
        <Toaster />
      </>
    );
  }

  return (
    <>
      {isSignedIn ? <AppShell>{content}</AppShell> : <AuthGate />}
      <Toaster />
    </>
  );
}
