import { Worker, WorkerOptions, Job } from 'bullmq'
import { TextChannel } from 'discord.js'
import redis from '../config/redis'
import discord from '../discord'

export class DiscordJob extends Job {
  declare data: {
    url: string
    threadId: string
    channelId: string
    wikidataId?: string
    messageId?: string

    // TODO: find a better type for this
    childrenValues: any
  }
  message: any
  sendMessage: (
    msg: string | { content: string; components: any[] }
  ) => Promise<any>
  editMessage: (msg: string) => Promise<any>
  setThreadName: (name: string) => Promise<any>
  getChildrenEntries: () => Promise<any>
}

export class DiscordWorker<T extends DiscordJob> extends Worker<any> {
  constructor(
    name: string,
    callback: (job: T) => Promise<any>,
    options?: WorkerOptions
  ) {
    super(
      name,
      async (job: T) => {
        job.getChildrenEntries = async () => {
          const values = await job
            .getChildrenValues()
            .then((values) => Object.values(values))
            .then((values) =>
              values.map((value) => Object.entries(JSON.parse(value))).flat()
            )
            .then((values) => Object.fromEntries(values))
          return values
        }
        job.sendMessage = async (msg) => {
          job.message = await discord.sendMessage(job.data, msg)
          if (!job.message) return undefined // TODO: throw error?
          await job.updateData({ ...job.data, messageId: job.message.id })
          return job.message
        }
        job.editMessage = (msg) => {
          if (!job.message && job.data.messageId) {
            const { channelId, threadId, messageId } = job.data
            job.message = discord.findMessage({
              channelId,
              threadId,
              messageId,
            })
          }
          if (job.message) {
            try {
              return job.message.edit(msg)
            } catch (err) {
              job.log('error editing Discord message:' + err.message)
              return job.sendMessage(msg)
            }
          } else {
            return job.sendMessage(msg)
          }
        }
        job.setThreadName = async (name) => {
          const thread = (await discord.client.channels.fetch(
            job.data.threadId
          )) as TextChannel
          return thread.setName(name)
        }
        try {
          const values = await job.getChildrenEntries()
          await job.updateData({ ...job.data, childrenValues: values })
          return callback(job)
        } catch (err) {
          job.sendMessage(`❌ ${this.name}: ${err.message}`)
          throw err
        }
      },
      {
        connection: redis,
        concurrency: 10,
        ...options,
      }
    )
  }
}
