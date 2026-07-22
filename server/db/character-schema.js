import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth-schema.js';

export const characters = pgTable('characters', {
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  revision: integer('revision').default(1).notNull(),
  schemaVersion: integer('schema_version').notNull(),
  documentJson: jsonb('document_json').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, table => [
  primaryKey({ columns: [table.ownerId, table.id], name: 'characters_owner_id_id_pk' }),
  check('characters_revision_check', sql`${table.revision} >= 1`),
  check('characters_schema_version_check', sql`${table.schemaVersion} >= 1`),
  check('characters_document_json_object_check', sql`jsonb_typeof(${table.documentJson}) = 'object'`),
  index('characters_owner_updated_id_idx').on(table.ownerId, table.updatedAt.desc(), table.id)
]);
