import { AuthenticatedFastifyRequest, FastifyInstance, FastifyRequest } from 'fastify'
import { getTags } from '../../config/openapi'
import { askPrompt } from '../../lib/openai'
import { promptSchema } from '../schemas'
import { PromptBody } from '../types'

export async function chatRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      schema: {
        summary: 'Chat with the Garbo LLM',
        description:
          'Prompt the Garbo LLM',
        tags: getTags('Chat'),

        body: promptSchema,
        response: {
          200: String,
        },
      },
    },
    async (
      request: AuthenticatedFastifyRequest<{
        Body: PromptBody
      }>,
      reply
    ) => {
        const promptResponse: string = await askPrompt(request.body.prompt, '')
        reply.send(promptResponse)
    }
  )
}
