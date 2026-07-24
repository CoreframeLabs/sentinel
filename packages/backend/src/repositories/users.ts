import { Queryable, UserRow, Role } from './types';

/**
 * findUserByEmail is deliberately the only unscoped read in this repository:
 * it backs login, where no organisation context exists yet. Every other
 * method requires organisationId and filters on it.
 */
export async function findUserByEmail(db: Queryable, email: string): Promise<UserRow | null> {
  const result = await db.query<UserRow>('SELECT * FROM users WHERE lower(email) = lower($1)', [
    email,
  ]);
  return result.rows[0] ?? null;
}

export interface CreateUserInput {
  organisationId: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: Role;
}

export async function createUser(db: Queryable, input: CreateUserInput): Promise<UserRow> {
  const result = await db.query<UserRow>(
    `INSERT INTO users (organisation_id, email, password_hash, display_name, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.organisationId, input.email, input.passwordHash, input.displayName, input.role]
  );
  return result.rows[0]!;
}

export async function findUserById(
  db: Queryable,
  organisationId: string,
  id: string
): Promise<UserRow | null> {
  const result = await db.query<UserRow>(
    'SELECT * FROM users WHERE organisation_id = $1 AND id = $2',
    [organisationId, id]
  );
  return result.rows[0] ?? null;
}

export async function listUsersByOrganisation(
  db: Queryable,
  organisationId: string
): Promise<UserRow[]> {
  const result = await db.query<UserRow>(
    'SELECT * FROM users WHERE organisation_id = $1 ORDER BY created_at ASC',
    [organisationId]
  );
  return result.rows;
}
