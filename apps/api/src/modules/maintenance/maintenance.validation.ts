import { MaintenanceStatus } from '@prisma/client';
import { z } from 'zod';
import { fail } from '../../security';
import { round2 } from './maintenance.calc';

const MAX_HOURS = 9999.99;
const MAX_PRICE = 9999999999.99;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface CreateEntryInput {
  date: string;
  hours: number;
  description: string;
  changeRequestId?: string;
}

export interface MonthRange {
  month: string;
  start: Date;
  end: Date;
}

const entrySchema = z.object({
  date: z
    .string()
    .min(10)
    .max(40)
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'invalid date' }),
  hours: z.number().finite().positive().max(MAX_HOURS),
  description: z.string().max(2000),
  changeRequestId: z.string().regex(UUID_PATTERN).optional(),
});

const hoursPerMonthSchema = z.number().finite().positive().max(MAX_HOURS);
const monthlyPriceSchema = z.number().finite().min(0).max(MAX_PRICE);

export function validateEntryInput(input: CreateEntryInput): CreateEntryInput {
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) fail('INVALID_MAINTENANCE_ENTRY', 400);
  const hours = parsed.data.hours;
  if (Math.abs(hours * 100 - Math.round(hours * 100)) > 1e-6)
    fail('INVALID_MAINTENANCE_ENTRY', 400);
  const description = parsed.data.description.trim();
  if (!description) fail('INVALID_MAINTENANCE_ENTRY', 400);
  return {
    date: parsed.data.date,
    hours: round2(hours),
    description,
    changeRequestId: parsed.data.changeRequestId,
  };
}

export function validateHoursPerMonth(value: number): number {
  const parsed = hoursPerMonthSchema.safeParse(value);
  if (!parsed.success) fail('INVALID_MAINTENANCE_AGREEMENT', 400);
  return round2(parsed.data);
}

export function validateMonthlyPrice(value: number): number {
  const parsed = monthlyPriceSchema.safeParse(value);
  if (!parsed.success) fail('INVALID_MAINTENANCE_AGREEMENT', 400);
  return round2(parsed.data);
}

export function monthRange(month?: string): MonthRange {
  const label = month ?? new Date().toISOString().slice(0, 7);
  const match = MONTH_PATTERN.exec(label);
  if (!match) fail('INVALID_MONTH', 400);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return {
    month: label,
    start: new Date(Date.UTC(year, monthIndex, 1)),
    end: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

export function assertMaintenanceActive(status: MaintenanceStatus): void {
  if (status !== MaintenanceStatus.active) fail('MAINTENANCE_NOT_ACTIVE', 409);
}

export function assertReopenable(current: MaintenanceStatus, next?: MaintenanceStatus): void {
  if (next === undefined || next === current) return;
  if (current === MaintenanceStatus.ended) fail('MAINTENANCE_ENDED', 409);
}

export function parseDate(value: string, code: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(code, 400);
  return date;
}
