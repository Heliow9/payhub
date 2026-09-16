import { timingSafeEqual } from 'node:crypto';
import type { Session } from '../sessions/session.repository.js';
import type { UserRole } from './types.js';
import { hashToken } from './token.js';

export function canAccessRole(role: UserRole, allowed: readonly UserRole[]): boolean {
  return allowed.includes(role);
}

export function csrfMatches(session: Session, providedToken: string | undefined): boolean {
  if (!providedToken) return false;
  const actual = Buffer.from(hashToken(providedToken), 'hex');
  const expected = Buffer.from(session.csrfTokenHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
