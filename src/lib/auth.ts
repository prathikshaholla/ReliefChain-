// ============================================================================
// ReliefChain - JWT authentication & RBAC enforcement (server only)
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================

import jwt from 'jsonwebtoken';
import type { NextRequest } from 'next/server';
import { HttpError } from '@/lib/http';
import { PERMISSIONS, Permission, UserRole } from '@/lib/permissions';

export type { UserRole } from '@/lib/permissions';

const DEV_SECRET = 'reliefchain-dev-only-secret-do-not-use-in-production';

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  return DEV_SECRET;
}

export interface UserSession {
  userId: number;
  email: string;
  fullName: string;
  role: UserRole;
  zoneId: number | null;
}

export function signToken(user: UserSession): string {
  return jwt.sign(user, secret(), { expiresIn: '8h' });
}

export function verifyToken(token: string): UserSession | null {
  try {
    const { userId, email, fullName, role, zoneId } = jwt.verify(token, secret()) as UserSession;
    return { userId, email, fullName, role, zoneId };
  } catch {
    return null;
  }
}

/**
 * Returns the caller's session or throws 401.
 * If a permission is given, also throws 403 when the role lacks it.
 */
export function requireUser(req: NextRequest, permission?: Permission): UserSession {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token ? verifyToken(token) : null;
  if (!user) throw new HttpError(401, 'Please sign in to continue');

  if (permission && !(PERMISSIONS[permission] as readonly UserRole[]).includes(user.role)) {
    throw new HttpError(403, `Your role (${user.role}) is not allowed to perform this action`);
  }
  return user;
}
