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

import apiConfig from './config/api'
import openAPIConfig from './config/openapi'
import { companyReadRoutes } from './api/routes/company.read'
import { companyGoalsRoutes } from './api/routes/company.goals'
import authPlugin from './api/plugins/auth'
import { companyIndustryRoutes } from './api/routes/company.industry'
import { companyInitiativesRoutes } from './api/routes/company.initiatives'
import { companyReportingPeriodsRoutes } from './api/routes/company.reportingPeriods'
import { companyUpdateRoutes } from './api/routes/company.update'
import { companyDeleteRoutes } from './api/routes/company.delete'
import { errorHandler } from './api/plugins/errorhandler'

async function startApp() {
  const app = Fastify({
    logger: apiConfig.logger,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  app.setErrorHandler(errorHandler)

  app.register(fastifySwagger, {
    prefix: openAPIConfig.prefix,
    openapi: {
      openapi: '3.1.1',
      info: {
        title: openAPIConfig.title,
        description: openAPIConfig.description,
        version: JSON.parse(readFileSync(resolve('package.json'), 'utf-8'))
          .version,
      },
      tags: Object.values(openAPIConfig.tags),
    },
    transform: jsonSchemaTransform,
  })

  app.register(scalarPlugin, {
    routePrefix: `/${openAPIConfig.prefix}`,
    logLevel: 'silent',
    configuration: {
      title: openAPIConfig.title,
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
  app.get('/', { schema: { hide: true } }, (request, reply) =>
    reply.redirect(openAPIConfig.prefix)
  )

  app.register(companyReadRoutes, { prefix: 'api/companies' })
}

/**
 * This context wraps all logic that requires authentication.
 */
async function authenticatedContext(app: FastifyInstance) {
  app.register(authPlugin)

  app.register(companyUpdateRoutes, { prefix: 'api/companies' })
  app.register(companyIndustryRoutes, { prefix: 'api/companies' })
  app.register(companyReportingPeriodsRoutes, { prefix: 'api/companies' })
  app.register(companyGoalsRoutes, { prefix: 'api/companies' })
  app.register(companyInitiativesRoutes, { prefix: 'api/companies' })

  app.register(companyDeleteRoutes, { prefix: 'api/companies' })
}

export default startApp
