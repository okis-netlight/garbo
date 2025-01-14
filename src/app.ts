import Fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
  jsonSchemaTransform,
} from 'fastify-type-provider-zod'
import fastifySwagger from '@fastify/swagger'
import scalarPlugin from '@scalar/fastify-api-reference'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { z } from 'zod'

import apiConfig from './config/api'
import openAPIConfig from './config/openapi'
import { companyReadRoutes } from './api/routes/company.read'

// import { sessionPlugin, authenticationRequiredPlugin } from './lib/auth'

async function startApp() {
  const app = Fastify({
    logger: apiConfig.logger,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // app.register(sessionPlugin)

  app.register(fastifySwagger, {
    prefix: openAPIConfig.openAPIPrefix,
    openapi: {
      openapi: '3.1.1',
      info: {
        title: 'Klimatkollen API Reference',
        description: 'OpenAPI docs',
        version: JSON.parse(readFileSync(resolve('package.json'), 'utf-8'))
          .version,
      },
      tags: Object.values(openAPIConfig.openAPITags),
    },
    transform: jsonSchemaTransform,
  })

  app.register(scalarPlugin, {
    routePrefix: `/${openAPIConfig.openAPIPrefix}`,
    logLevel: 'silent',
    configuration: {
      title: 'Klimatkollen API Reference',
    },
  })

  app.register(publicContext)
  app.register(authenticatedContext)

  return app
}

/**
 * This context wraps all logic that should be public.
 */
async function publicContext(app: FastifyInstance) {
  app.get(
    '/health-check',
    {
      schema: {
        response: {
          200: z.object({ ok: z.boolean() }),
        },
      },
    },
    async () => ({ ok: true })
  )

  app.register(companyReadRoutes)
}

/**
 * This context wraps all logic that requires authentication.
 */
async function authenticatedContext(app: FastifyInstance) {
  // app.register(authenticationRequiredPlugin)
  // TODO: POST and delete routes
}

export default startApp
