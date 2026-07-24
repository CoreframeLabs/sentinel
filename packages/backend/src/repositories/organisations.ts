import { Queryable, OrganisationRow } from './types';

export async function createOrganisation(db: Queryable, name: string): Promise<OrganisationRow> {
  const result = await db.query<OrganisationRow>(
    'INSERT INTO organisations (name) VALUES ($1) RETURNING *',
    [name]
  );
  return result.rows[0]!;
}

export async function findOrganisationById(
  db: Queryable,
  id: string
): Promise<OrganisationRow | null> {
  const result = await db.query<OrganisationRow>('SELECT * FROM organisations WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}
