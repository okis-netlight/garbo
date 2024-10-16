import { Worker, Job } from 'bullmq'
import redis from '../config/redis'
import { indexParagraphs } from '../queues'
import discord from '../discord'
import { DiscordWorker, DiscordJob } from '../lib/DiscordWorker'

class JobData extends DiscordJob {
  declare data: DiscordJob['data'] & {
    markdown: boolean
    text: string
    pdfHash: string
  }
}

const worker = new DiscordWorker('splitText', async (job: JobData) => {
  const { text, markdown = false } = job.data

  job.log(`Splitting text: ${text.slice(0, 20)}`)

  const paragraphs = text.split('\n\n').filter((p) => p.trim().length > 0)

  await job.sendMessage(`✅ Uppdelad i ${paragraphs.length} paragrafer...`)

  indexParagraphs.add(
    'found ' + paragraphs.length,
    {
      ...job.data,
      paragraphs,
    },
    {
      attempts: 3,
    }
  )

  job.log(`found ${paragraphs.length} paragraphs`)

  return paragraphs
})

export default worker
