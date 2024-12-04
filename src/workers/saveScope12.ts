import { DiscordJob, DiscordWorker } from '../lib/DiscordWorker'
import { apiFetch } from '../lib/api'
import { defaultMetadata, askDiff } from '../lib/saveUtils'
import discord from '../discord'

const ONE_DAY = 1000 * 60 * 60 * 24
import redis from '../config/redis'
import { getReportingPeriodDates } from '../lib/reportingPeriodDates'

export class JobData extends DiscordJob {
  declare data: DiscordJob['data'] & {
    companyName: string
    wikidata: any
    fiscalYear: any
    scope12?: any[]
  }
}

const saveScope12 = new DiscordWorker<JobData>('saveScope12', async (job) => {
  const { url, fiscalYear, wikidata, scope12 = [] } = job.data
  const wikidataId = wikidata.node
  const metadata = defaultMetadata(url)

  if (scope12?.length) {
    const existingCompany = await apiFetch(`/companies/${wikidataId}`).catch(
      () => null
    )
    const diff = await askDiff(existingCompany, { scope12, fiscalYear })

    if (diff && !diff.includes('NO_CHANGES')) {
      const buttonRow = discord.createButtonRow(job.id!)
      await job.sendMessage({
        content:
          `# ${job.data.companyName}: scope 1+2 emissions\n${diff}`.slice(
            0,
            2000
          ),
        components: [buttonRow],
      })
      await job.moveToDelayed(Date.now() + ONE_DAY)
      return { diff }
    }

    job.editMessage(`🤖 Sparar utsläppsdata scope 1+2...`)
    return Promise.all(
      scope12.map(async ({ year, scope1, scope2 }) => {
        const [startDate, endDate] = getReportingPeriodDates(
          year,
          fiscalYear.startMonth,
          fiscalYear.endMonth
        )
        job.log(`Saving scope1 and scope2 for ${startDate}-${endDate}`)
        job.sendMessage(`🤖 Sparar utsläppsdata scope 1+2 för ${year}...`)
        const body = {
          startDate,
          endDate,
          emissions: {
            scope1,
            scope2,
          },
          metadata,
        }
        return await apiFetch(`/companies/${wikidataId}/${year}/emissions`, {
          body,
        })
      })
    )
  }
  return null
})

export default saveScope12
