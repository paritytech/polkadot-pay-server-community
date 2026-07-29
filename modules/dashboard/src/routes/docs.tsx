// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech
import { createFileRoute } from '@tanstack/react-router';
import { ApiDocsPage } from '../features/docs/components/ApiDocsPage';

export const Route = createFileRoute('/docs')({ component: ApiDocsPage });
