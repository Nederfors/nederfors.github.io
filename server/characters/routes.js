import { getAuthSession } from '../auth/session.js';
import {
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  updateCharacter
} from './repository.js';

const errorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: { error: { type: 'string' } }
};

const documentSchema = {
  type: 'object',
  additionalProperties: true,
  required: ['format', 'formatVersion', 'rulesetVersion', 'name', 'data'],
  properties: {
    format: { type: 'string', const: 'symbapedia-character' },
    formatVersion: { type: 'integer', const: 2 },
    rulesetVersion: { type: 'integer', minimum: 1 },
    name: { type: 'string' },
    folderId: { type: 'string' },
    data: { type: 'object', additionalProperties: true }
  }
};

const characterSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'revision', 'schemaVersion', 'document', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    revision: { type: 'integer', minimum: 1 },
    schemaVersion: { type: 'integer', minimum: 1 },
    document: documentSchema,
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

const characterResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['character'],
  properties: { character: characterSchema }
};

const listResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['characters'],
  properties: { characters: { type: 'array', items: characterSchema } }
};

const idParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1 } }
};

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'document'],
  properties: {
    id: { type: 'string', minLength: 1 },
    document: documentSchema
  }
};

const updateBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedRevision', 'document'],
  properties: {
    expectedRevision: { type: 'integer', minimum: 1 },
    document: documentSchema
  }
};

const deleteBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedRevision'],
  properties: { expectedRevision: { type: 'integer', minimum: 1 } }
};

const standardErrors = {
  400: errorSchema,
  401: errorSchema,
  404: errorSchema,
  409: errorSchema,
  500: errorSchema
};

function mutationMiss(result, reply) {
  if (result.status === 'revision_conflict') {
    return reply.code(409).send({ error: 'revision_conflict' });
  }
  return reply.code(404).send({ error: 'not_found' });
}

export async function characterRoutes(app, { auth, database }) {
  app.decorateRequest('characterOwnerId', null);
  app.addHook('onRequest', async (request, reply) => {
    const session = await getAuthSession({ auth, request });
    if (!session?.user?.id) return reply.code(401).send({ error: 'unauthorized' });
    request.characterOwnerId = session.user.id;
  });

  app.get('/api/v1/characters', {
    schema: { response: { 200: listResponseSchema, ...standardErrors } }
  }, async request => ({
    characters: await listCharacters(database, request.characterOwnerId)
  }));

  app.post('/api/v1/characters', {
    schema: {
      body: createBodySchema,
      response: { 201: characterResponseSchema, ...standardErrors }
    }
  }, async (request, reply) => {
    const result = await createCharacter(database, {
      ownerId: request.characterOwnerId,
      id: request.body.id,
      schemaVersion: request.body.document.formatVersion,
      document: request.body.document
    });
    if (result.status === 'conflict') {
      return reply.code(409).send({ error: 'character_id_conflict' });
    }
    return reply.code(201).send({ character: result.character });
  });

  app.get('/api/v1/characters/:id', {
    schema: {
      params: idParamsSchema,
      response: { 200: characterResponseSchema, ...standardErrors }
    }
  }, async (request, reply) => {
    const character = await getCharacter(database, request.characterOwnerId, request.params.id);
    if (!character) return reply.code(404).send({ error: 'not_found' });
    return { character };
  });

  app.put('/api/v1/characters/:id', {
    schema: {
      params: idParamsSchema,
      body: updateBodySchema,
      response: { 200: characterResponseSchema, ...standardErrors }
    }
  }, async (request, reply) => {
    const result = await updateCharacter(database, {
      ownerId: request.characterOwnerId,
      id: request.params.id,
      expectedRevision: request.body.expectedRevision,
      schemaVersion: request.body.document.formatVersion,
      document: request.body.document
    });
    if (result.status !== 'updated') return mutationMiss(result, reply);
    return { character: result.character };
  });

  app.delete('/api/v1/characters/:id', {
    schema: {
      params: idParamsSchema,
      body: deleteBodySchema,
      response: { 200: characterResponseSchema, ...standardErrors }
    }
  }, async (request, reply) => {
    const result = await deleteCharacter(database, {
      ownerId: request.characterOwnerId,
      id: request.params.id,
      expectedRevision: request.body.expectedRevision
    });
    if (result.status !== 'deleted') return mutationMiss(result, reply);
    return { character: result.character };
  });
}
