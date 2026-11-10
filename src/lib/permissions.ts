// ============================================================================
// ReliefChain - Role-Based Access Control matrix
// Owner: Member 1 (Database Architect & Core Backend)
//
// Shared by the API (enforcement) and the UI (hiding pages and buttons a role
// can't use), so both always agree. Contains no server-only imports.
// ============================================================================

export const ROLES = ['ADMIN', 'LOGISTICS_STAFF', 'FIRST_RESPONDER'] as const;
export type UserRole = (typeof ROLES)[number];

/** Actions, enforced by the API routes via requireUser(req, permission). */
export const PERMISSIONS = {
  dispatch:        ['ADMIN', 'LOGISTICS_STAFF'],
  confirmDelivery: ['ADMIN', 'LOGISTICS_STAFF', 'FIRST_RESPONDER'],
  failShipment:    ['ADMIN', 'LOGISTICS_STAFF'],
  restock:         ['ADMIN', 'LOGISTICS_STAFF'],
  createRequest:   ['ADMIN', 'FIRST_RESPONDER'],
  createCamp:      ['ADMIN'],
  submitSos:       ['ADMIN', 'FIRST_RESPONDER'],
  reportIncident:  ['ADMIN', 'FIRST_RESPONDER'],
  sqlLab:          ['ADMIN'],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole | undefined, permission: Permission): boolean {
  return !!role && (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}

/** Pages of the portal and the roles that may open them. */
export const PAGES = {
  dashboard: ['ADMIN', 'LOGISTICS_STAFF', 'FIRST_RESPONDER'],
  sos:       ['ADMIN', 'FIRST_RESPONDER'],
  dispatch:  ['ADMIN', 'LOGISTICS_STAFF', 'FIRST_RESPONDER'],
  inventory: ['ADMIN', 'LOGISTICS_STAFF'],
  camps:     ['ADMIN', 'LOGISTICS_STAFF', 'FIRST_RESPONDER'],
  telemetry: ['ADMIN', 'FIRST_RESPONDER'],
} as const satisfies Record<string, readonly UserRole[]>;

export type PageId = keyof typeof PAGES;

export function canOpen(role: UserRole | undefined, page: PageId): boolean {
  return !!role && (PAGES[page] as readonly UserRole[]).includes(role);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Relief Coordinator',
  LOGISTICS_STAFF: 'Logistics Officer',
  FIRST_RESPONDER: 'Field Officer',
};

/** What each role can do, in plain words (shown on the sign-in screen). */
export const ROLE_SUMMARY: Record<UserRole, string> = {
  ADMIN: 'Full access to every page and action',
  LOGISTICS_STAFF: 'Send supplies, manage warehouse stock and vehicles',
  FIRST_RESPONDER: 'Record emergency calls, raise requests, confirm deliveries',
};

/** Demo accounts created by sql/05_seed.sql (one per role). */
export const DEMO_ACCOUNTS: { role: UserRole; email: string; password: string }[] = [
  { role: 'ADMIN', email: 'admin@reliefchain.org', password: 'admin123' },
  { role: 'LOGISTICS_STAFF', email: 'logistics@reliefchain.org', password: 'logistics123' },
  { role: 'FIRST_RESPONDER', email: 'responder@reliefchain.org', password: 'responder123' },
];
