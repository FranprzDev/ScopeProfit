import { Injectable } from '@nestjs/common';
import {
  ChangeRequestStatus,
  MaintenanceAgreement as AgreementRow,
  MaintenanceEntry as EntryRow,
  MaintenanceStatus,
  Prisma,
  User,
} from '@prisma/client';
import type {
  MaintenanceAgreement as AgreementDto,
  MaintenanceBalance as BalanceDto,
  MaintenanceEntry as EntryDto,
  MaintenanceMonth as MonthDto,
  MaintenanceSummary as SummaryDto,
} from '@scopeprofit/contracts';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { fail } from '../../security';
import { computeBalance, computeEntrySplit } from './maintenance.calc';
import {
  assertMaintenanceActive,
  assertReopenable,
  monthRange,
  parseDate,
  validateEntryInput,
  validateHoursPerMonth,
  validateMonthlyPrice,
  type CreateEntryInput,
} from './maintenance.validation';

export interface CreateAgreementInput {
  hoursPerMonth: number;
  monthlyPrice?: number | null;
  currency: string;
  startDate: string;
}

export interface PatchAgreementInput {
  hoursPerMonth?: number;
  monthlyPrice?: number | null;
  startDate?: string;
  endDate?: string | null;
  status?: MaintenanceStatus;
}

const entriesInclude = {
  entries: { orderBy: [{ date: 'desc' as const }, { createdAt: 'desc' as const }] },
};

type AgreementWithEntries = AgreementRow & { entries: EntryRow[] };

export const toEntryDto = (row: EntryRow): EntryDto => ({
  id: row.id,
  agreementId: row.agreementId,
  changeRequestId: row.changeRequestId,
  date: row.date.toISOString(),
  hours: Number(row.hours),
  extraHours: Number(row.extraHours),
  description: row.description,
  billableExtra: row.billableExtra,
  createdAt: row.createdAt.toISOString(),
});

export const toAgreementDto = (row: AgreementWithEntries): AgreementDto => ({
  id: row.id,
  projectId: row.projectId,
  status: row.status,
  hoursPerMonth: Number(row.hoursPerMonth),
  monthlyPrice: row.monthlyPrice === null ? null : Number(row.monthlyPrice),
  currency: row.currency,
  startDate: row.startDate.toISOString(),
  endDate: row.endDate === null ? null : row.endDate.toISOString(),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  entries: row.entries.map(toEntryDto),
});

@Injectable()
export class MaintenanceService {
  constructor(
    private db: PrismaService,
    private auth: AuthService,
  ) {}

  private async authorize(user: User, projectId: string) {
    this.auth.professional(user);
    return this.auth.project(user, projectId);
  }

  async listMine(user: User): Promise<{ agreements: SummaryDto[] }> {
    this.auth.professional(user);
    const rows = await this.db.maintenanceAgreement.findMany({
      where: { project: { ownerId: user.id } },
      orderBy: { startDate: 'desc' },
      include: { project: { select: { name: true } } },
    });
    return {
      agreements: rows.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        projectName: row.project.name,
        status: row.status,
        hoursPerMonth: Number(row.hoursPerMonth),
        monthlyPrice: row.monthlyPrice === null ? null : Number(row.monthlyPrice),
        currency: row.currency,
        startDate: row.startDate.toISOString(),
      })),
    };
  }

  async get(user: User, projectId: string): Promise<AgreementDto> {
    await this.authorize(user, projectId);
    const agreement = await this.db.maintenanceAgreement.findUnique({
      where: { projectId },
      include: entriesInclude,
    });
    if (!agreement) fail('MAINTENANCE_NOT_FOUND', 404);
    return toAgreementDto(agreement);
  }

  async create(user: User, projectId: string, input: CreateAgreementInput): Promise<AgreementDto> {
    await this.authorize(user, projectId);
    const data = {
      status: MaintenanceStatus.active,
      hoursPerMonth: validateHoursPerMonth(input.hoursPerMonth),
      monthlyPrice:
        input.monthlyPrice === undefined || input.monthlyPrice === null
          ? null
          : validateMonthlyPrice(input.monthlyPrice),
      currency: input.currency.toUpperCase(),
      startDate: parseDate(input.startDate, 'INVALID_MAINTENANCE_AGREEMENT'),
    };
    const agreement = await this.db.$transaction(async (tx) => {
      const rows = await tx.maintenanceAgreement.createManyAndReturn({
        data: { projectId, ...data },
        skipDuplicates: true,
      });
      const created = rows[0];
      if (!created) fail('MAINTENANCE_EXISTS', 409);
      await tx.auditEvent.create({
        data: {
          projectId,
          actorId: user.id,
          action: 'maintenance.created',
          result: 'success',
          metadata: {
            agreementId: created.id,
            hoursPerMonth: Number(created.hoursPerMonth),
            currency: created.currency,
          },
        },
      });
      return tx.maintenanceAgreement.findUniqueOrThrow({
        where: { id: created.id },
        include: entriesInclude,
      });
    });
    return toAgreementDto(agreement);
  }

  async patch(user: User, projectId: string, input: PatchAgreementInput): Promise<AgreementDto> {
    await this.authorize(user, projectId);
    const current = await this.db.maintenanceAgreement.findUnique({
      where: { projectId },
      select: { id: true, status: true },
    });
    if (!current) fail('MAINTENANCE_NOT_FOUND', 404);
    assertReopenable(current.status, input.status);

    const data: Prisma.MaintenanceAgreementUpdateInput = {};
    const fields: string[] = [];
    if (input.hoursPerMonth !== undefined) {
      data.hoursPerMonth = validateHoursPerMonth(input.hoursPerMonth);
      fields.push('hoursPerMonth');
    }
    if (input.monthlyPrice !== undefined) {
      data.monthlyPrice =
        input.monthlyPrice === null ? null : validateMonthlyPrice(input.monthlyPrice);
      fields.push('monthlyPrice');
    }
    if (input.startDate !== undefined) {
      data.startDate = parseDate(input.startDate, 'INVALID_MAINTENANCE_AGREEMENT');
      fields.push('startDate');
    }
    if (input.endDate !== undefined) {
      data.endDate =
        input.endDate === null ? null : parseDate(input.endDate, 'INVALID_MAINTENANCE_AGREEMENT');
      fields.push('endDate');
    }
    if (input.status !== undefined) {
      data.status = input.status;
      fields.push('status');
    }

    const saved = await this.db.$transaction(async (tx) => {
      const updated = await tx.maintenanceAgreement.update({ where: { projectId }, data });
      await tx.auditEvent.create({
        data: {
          projectId,
          actorId: user.id,
          action: 'maintenance.updated',
          result: 'success',
          metadata: { agreementId: updated.id, fields, status: updated.status },
        },
      });
      return tx.maintenanceAgreement.findUniqueOrThrow({
        where: { id: updated.id },
        include: entriesInclude,
      });
    });
    return toAgreementDto(saved);
  }

  async listEntries(user: User, projectId: string, month?: string): Promise<MonthDto> {
    const agreement = await this.activeAgreement(user, projectId);
    const range = monthRange(month);
    const entries = await this.db.maintenanceEntry.findMany({
      where: { agreementId: agreement.id, date: { gte: range.start, lt: range.end } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return { month: range.month, entries: entries.map(toEntryDto) };
  }

  async balance(user: User, projectId: string, month?: string): Promise<BalanceDto> {
    const agreement = await this.activeAgreement(user, projectId);
    const range = monthRange(month);
    const entries = await this.db.maintenanceEntry.findMany({
      where: { agreementId: agreement.id, date: { gte: range.start, lt: range.end } },
      select: { hours: true, extraHours: true },
    });
    const totals = computeBalance(
      entries.map((entry) => ({
        hours: Number(entry.hours),
        extraHours: Number(entry.extraHours),
      })),
      Number(agreement.hoursPerMonth),
    );
    return { month: range.month, ...totals };
  }

  async createEntry(user: User, projectId: string, input: CreateEntryInput): Promise<EntryDto> {
    await this.authorize(user, projectId);
    const entry = validateEntryInput(input);
    const date = parseDate(entry.date, 'INVALID_MAINTENANCE_ENTRY');
    const created = await this.db.$transaction(async (tx) => {
      const agreement = await tx.maintenanceAgreement.findUnique({
        where: { projectId },
        select: { id: true, status: true, hoursPerMonth: true },
      });
      if (!agreement) fail('MAINTENANCE_NOT_FOUND', 404);
      assertMaintenanceActive(agreement.status);
      if (entry.changeRequestId) {
        const changeRequest = await tx.changeRequest.findFirst({
          where: { id: entry.changeRequestId, projectId },
          select: { status: true },
        });
        if (!changeRequest || changeRequest.status !== ChangeRequestStatus.accepted)
          fail('CHANGE_REQUEST_NOT_ACCEPTED', 409);
      }
      const range = monthRange(date.toISOString().slice(0, 7));
      const monthEntries = await tx.maintenanceEntry.findMany({
        where: { agreementId: agreement.id, date: { gte: range.start, lt: range.end } },
        select: { hours: true, extraHours: true },
      });
      const totals = computeBalance(
        monthEntries.map((row) => ({
          hours: Number(row.hours),
          extraHours: Number(row.extraHours),
        })),
        Number(agreement.hoursPerMonth),
      );
      const split = computeEntrySplit(entry.hours, totals.remaining);
      const saved = await tx.maintenanceEntry.create({
        data: {
          agreementId: agreement.id,
          changeRequestId: entry.changeRequestId ?? null,
          date,
          hours: entry.hours,
          extraHours: split.extraHours,
          description: entry.description,
          billableExtra: split.billableExtra,
        },
      });
      await tx.auditEvent.create({
        data: {
          projectId,
          actorId: user.id,
          action: 'maintenance.entry_created',
          result: 'success',
          metadata: {
            entryId: saved.id,
            hours: entry.hours,
            extraHours: split.extraHours,
            changeRequestId: entry.changeRequestId ?? null,
          },
        },
      });
      return saved;
    });
    return toEntryDto(created);
  }

  private async activeAgreement(user: User, projectId: string) {
    await this.authorize(user, projectId);
    const agreement = await this.db.maintenanceAgreement.findUnique({
      where: { projectId },
      select: { id: true, hoursPerMonth: true },
    });
    if (!agreement) fail('MAINTENANCE_NOT_FOUND', 404);
    return agreement;
  }
}
