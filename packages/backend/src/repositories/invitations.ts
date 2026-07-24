import { Queryable, InvitationRow, Role } from './types';

export interface CreateInvitationInput {
  email: string;
  role: Role;
  selector: string;
  verifierHash: string;
  expiresAt: Date;
  createdBy: string;
}

export async function createInvitation(
  db: Queryable,
  organisationId: string,
  input: CreateInvitationInput
): Promise<InvitationRow> {
  const result = await db.query<InvitationRow>(
    `INSERT INTO invitations
       (organisation_id, email, role, selector, verifier_hash, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      organisationId,
      input.email,
      input.role,
      input.selector,
      input.verifierHash,
      input.expiresAt,
      input.createdBy,
    ]
  );
  return result.rows[0]!;
}

/**
 * Unscoped by design: invitation acceptance happens before the user belongs
 * to an organisation. The selector is a random, unique, non-secret lookup
 * key; the secret verifier is checked by the caller in constant time.
 */
export async function findInvitationBySelector(
  db: Queryable,
  selector: string
): Promise<InvitationRow | null> {
  const result = await db.query<InvitationRow>('SELECT * FROM invitations WHERE selector = $1', [
    selector,
  ]);
  return result.rows[0] ?? null;
}

export async function markInvitationUsed(
  db: Queryable,
  organisationId: string,
  id: string
): Promise<void> {
  await db.query('UPDATE invitations SET used_at = now() WHERE organisation_id = $1 AND id = $2', [
    organisationId,
    id,
  ]);
}

export async function listInvitations(
  db: Queryable,
  organisationId: string
): Promise<InvitationRow[]> {
  const result = await db.query<InvitationRow>(
    'SELECT * FROM invitations WHERE organisation_id = $1 ORDER BY created_at DESC',
    [organisationId]
  );
  return result.rows;
}
