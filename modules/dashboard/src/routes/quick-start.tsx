// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createFileRoute } from '@tanstack/react-router';
import { QuickStartPage } from '../features/quickstart/QuickStartPage';

export const Route = createFileRoute('/quick-start')({ component: QuickStartPage });