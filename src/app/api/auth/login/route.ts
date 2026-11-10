// ============================================================================
// POST /api/auth/login  { email, password } -> { token, user }
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================

import bcrypt from 'bcryptjs';
import { query } from '@/lib/db/postgres';
import { HttpError, ok, readJson, reqString, route } from '@/lib/http';
import { signToken, UserSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Used when the email is unknown so the response time doesn't reveal
// whether an account exists (bcrypt hash of a random string).
const DUMMY_HASH = '$2a$10$yPGjA5oROe5pYGBwj8K8He1g45N8ORSJrF2rWcVT7dChDGaSrnmku';

export const POST = route(async (req) => {
  const body = await readJson(req);
  const email = reqString(body.email, 'email', 120).toLowerCase();
  const password = reqString(body.password, 'password', 200);

  const res = await query(
    `SELECT id, email, password_hash, full_name, role, assigned_zone_id, is_active FROM users WHERE email = $1`,
    [email]
  );
  const user = res.rows[0];

  const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !valid) throw new HttpError(401, 'Invalid email or password');
  if (!user.is_active) throw new HttpError(403, 'This account has been deactivated');

  const session: UserSession = {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    zoneId: user.assigned_zone_id,
  };

  return ok({ token: signToken(session), user: session });
});
