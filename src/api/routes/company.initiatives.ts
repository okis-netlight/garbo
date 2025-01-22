import { FastifyInstance, AuthenticatedFastifyRequest } from 'fastify'

import { getTags } from '../../config/openapi'
import { metadataService } from '../services/metadataService'
import {
  wikidataIdParamSchema,
  okResponseSchema,
  postInitiativeSchema,
  postInitiativesSchema,
  garboEntityIdSchema,
  getErrorSchemas,
} from '../schemas'
import { initiativeService } from '../services/initiativeService'
import {
  WikidataIdParams,
  PostInitiativeBody,
  PostInitiativesBody,
  GarboEntityId,
} from '../types'

export async function companyInitiativesRoutes(app: FastifyInstance) {
  app.post(
    '/:wikidataId/initiatives',
    {
      schema: {
        summary: 'Create company initiatives',
        description: 'Create new initiatives for a company',
        tags: getTags('Initiatives'),
        params: wikidataIdParamSchema,
        body: postInitiativesSchema,
        response: {
          200: okResponseSchema,
          ...getErrorSchemas(400, 404),
        },
      },
    },
    async (
      request: AuthenticatedFastifyRequest<{
        Params: WikidataIdParams
        Body: PostInitiativesBody
      }>,
      reply
    ) => {
      const { initiatives, metadata } = request.body

      if (initiatives?.length) {
        const { wikidataId } = request.params

        await initiativeService.createInitiatives(wikidataId, initiatives, () =>
          metadataService.createMetadata({
            metadata,
            user: request.user,
          })
        )
      }
      reply.send({ ok: true })
    }
  )

  app.patch(
    '/:wikidataId/initiatives/:id',
    {
      schema: {
        summary: 'Update a company initiative',
        description: 'Update an existing initiative for a company',
        tags: getTags('Initiatives'),
        params: garboEntityIdSchema,
        body: postInitiativeSchema,
        response: {
          200: okResponseSchema,
          ...getErrorSchemas(400, 404),
        },
      },
    },
    async (
      request: AuthenticatedFastifyRequest<{
        Params: GarboEntityId
        Body: PostInitiativeBody
      }>,
      reply
    ) => {
      const { id } = request.params
      const { initiative, metadata } = request.body
      const createdMetadata = await metadataService.createMetadata({
        metadata,
        user: request.user,
      })
      await initiativeService.updateInitiative(id, initiative, createdMetadata)

      reply.send({ ok: true })
    }
  )
}
