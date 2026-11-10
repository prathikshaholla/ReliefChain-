// ============================================================================
// GET /api/auth/me - validate the stored token and return the session
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================

import { ok, route } from '@/lib/http';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => ok({ user: requireUser(req) }));
