// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/payments' });
  },
});