const characterColumns = `
  id,
  revision,
  schema_version AS "schemaVersion",
  document_json AS document,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

function serializeTimestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function characterResource(row) {
  return {
    id: row.id,
    revision: row.revision,
    schemaVersion: row.schemaVersion,
    document: row.document,
    createdAt: serializeTimestamp(row.createdAt),
    updatedAt: serializeTimestamp(row.updatedAt)
  };
}

async function ownerHasCharacter(database, ownerId, id) {
  const result = await database.pool.query(
    'SELECT 1 FROM characters WHERE owner_id = $1 AND id = $2',
    [ownerId, id]
  );
  return result.rowCount > 0;
}

export async function listCharacters(database, ownerId) {
  const result = await database.pool.query(`
    SELECT ${characterColumns}
    FROM characters
    WHERE owner_id = $1
    ORDER BY updated_at DESC, id ASC
  `, [ownerId]);
  return result.rows.map(characterResource);
}

export async function createCharacter(database, { ownerId, id, schemaVersion, document }) {
  try {
    const result = await database.pool.query(`
      INSERT INTO characters (owner_id, id, schema_version, document_json)
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING ${characterColumns}
    `, [ownerId, id, schemaVersion, JSON.stringify(document)]);
    return { status: 'created', character: characterResource(result.rows[0]) };
  } catch (error) {
    if (error?.code === '23505' && error.constraint === 'characters_owner_id_id_pk') {
      return { status: 'conflict' };
    }
    throw error;
  }
}

export async function getCharacter(database, ownerId, id) {
  const result = await database.pool.query(`
    SELECT ${characterColumns}
    FROM characters
    WHERE owner_id = $1 AND id = $2
  `, [ownerId, id]);
  return result.rows[0] ? characterResource(result.rows[0]) : null;
}

export async function updateCharacter(database, {
  ownerId,
  id,
  expectedRevision,
  schemaVersion,
  document
}) {
  const result = await database.pool.query(`
    UPDATE characters
    SET revision = revision + 1,
        schema_version = $4,
        document_json = $5::jsonb,
        updated_at = now()
    WHERE owner_id = $1
      AND id = $2
      AND revision = $3
    RETURNING ${characterColumns}
  `, [ownerId, id, expectedRevision, schemaVersion, JSON.stringify(document)]);
  if (result.rows[0]) return { status: 'updated', character: characterResource(result.rows[0]) };
  return {
    status: await ownerHasCharacter(database, ownerId, id) ? 'revision_conflict' : 'not_found'
  };
}

export async function deleteCharacter(database, { ownerId, id, expectedRevision }) {
  const result = await database.pool.query(`
    DELETE FROM characters
    WHERE owner_id = $1
      AND id = $2
      AND revision = $3
    RETURNING ${characterColumns}
  `, [ownerId, id, expectedRevision]);
  if (result.rows[0]) return { status: 'deleted', character: characterResource(result.rows[0]) };
  return {
    status: await ownerHasCharacter(database, ownerId, id) ? 'revision_conflict' : 'not_found'
  };
}
