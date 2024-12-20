import { Economy, Employees, Metadata, Turnover } from '@prisma/client'
import { OptionalNullable } from '../../lib/type-utils'
import { DefaultEconomyArgs, economyArgs } from '../types'
import { prisma } from '../..'

class CompanyService {
  async upsertCompany({
    wikidataId,
    ...data
  }: {
    wikidataId: string
    name: string
    description?: string
    url?: string
    internalComment?: string
    tags?: string[]
  }) {
    return prisma.company.upsert({
      where: {
        wikidataId,
      },
      create: {
        ...data,
        wikidataId,
      },
      // TODO: Should we allow updating the wikidataId?
      // Probably yes from a business perspective, but that also means we need to update all related records too.
      // Updating the primary key can be tricky, especially with backups using the old primary key no longer being compatible.
      // This might be a reason why we shouldn't use wikidataId as our primary key in the DB.
      // However, no matter what, we could still use wikidataId in the API and in the URL structure.
      update: { ...data },
    })
  }

  async upsertEconomy({
    economyId,
    reportingPeriodId,
  }: {
    economyId: number
    reportingPeriodId: number
  }) {
    return prisma.economy.upsert({
      where: { id: economyId },
      update: {},
      create: {
        reportingPeriod: {
          connect: {
            id: reportingPeriodId,
          },
        },
      },
      ...economyArgs,
    })
  }

  async upsertTurnover(
    economy: Economy,
    turnover: OptionalNullable<
      Omit<Turnover, 'id' | 'metadataId' | 'unit' | 'economyId'>
    > | null,
    metadata: Metadata
  ) {
    if (turnover === null) {
      if (economy.turnoverId) {
        await prisma.turnover.delete({
          where: { id: economy.turnoverId },
        })
      }
      return null
    }

    return prisma.turnover.upsert({
      where: { id: economy.turnoverId ?? 0 },
      create: {
        ...turnover,
        metadata: {
          connect: { id: metadata.id },
        },
        economy: {
          connect: { id: economy.id },
        },
      },
      update: {
        ...turnover,
        metadata: {
          connect: { id: metadata.id },
        },
      },
      select: { id: true },
    })
  }

  async upsertEmployees({
    economy,
    employees,
    metadata,
  }: {
    economy: DefaultEconomyArgs
    employees: OptionalNullable<
      Omit<Employees, 'id' | 'metadataId' | 'economyId'>
    > | null
    metadata: Metadata
  }) {
    const existingEmployeesId = economy.employees?.id

    if (employees === null) {
      if (existingEmployeesId) {
        await prisma.employees.delete({
          where: { id: existingEmployeesId },
        })
      }
      return null
    }

    return prisma.employees.upsert({
      where: { id: existingEmployeesId ?? 0 },
      create: {
        ...employees,
        metadata: {
          connect: { id: metadata.id },
        },
        economy: {
          connect: { id: economy.id },
        },
      },
      update: {
        ...employees,
        metadata: {
          connect: { id: metadata.id },
        },
      },
      select: { id: true },
    })
  }
}

export const companyService = new CompanyService()
