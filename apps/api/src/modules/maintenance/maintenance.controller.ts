import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { MaintenanceStatus } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { ok, SESSION_COOKIE } from '../../response';
import { MaintenanceService } from './maintenance.service';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

class CreateAgreementDto {
  @IsNumber() @Min(0.01) @Max(9999.99) hoursPerMonth!: number;
  @IsOptional() @IsNumber() @Min(0) monthlyPrice?: number | null;
  @IsString() @Matches(/^[A-Za-z]{3}$/) currency!: string;
  @IsISO8601() startDate!: string;
}

class PatchAgreementDto {
  @IsOptional() @IsNumber() @Min(0.01) @Max(9999.99) hoursPerMonth?: number;
  @IsOptional() @IsNumber() @Min(0) monthlyPrice?: number | null;
  @IsOptional() @IsISO8601() startDate?: string;
  @IsOptional() @IsISO8601() endDate?: string | null;
  @IsOptional() @IsEnum(MaintenanceStatus) status?: MaintenanceStatus;
}

class CreateEntryDto {
  @IsISO8601() date!: string;
  @IsNumber() hours!: number;
  @IsString() @MaxLength(2000) description!: string;
  @IsOptional() @IsUUID() changeRequestId?: string;
}

class MonthQueryDto {
  @IsOptional() @Matches(MONTH_PATTERN) month?: string;
}

@Controller('projects/:id/maintenance')
export class MaintenanceController {
  constructor(
    private auth: AuthService,
    private maintenance: MaintenanceService,
  ) {}
  private user(req: Request) {
    return this.auth.session(req.cookies?.[SESSION_COOKIE]);
  }

  @Get()
  async get(@Req() req: Request, @Param('id') id: string) {
    return ok(await this.maintenance.get(await this.user(req), id));
  }

  @Post()
  async create(@Req() req: Request, @Param('id') id: string, @Body() body: CreateAgreementDto) {
    return ok(await this.maintenance.create(await this.user(req), id, body));
  }

  @Patch()
  async patch(@Req() req: Request, @Param('id') id: string, @Body() body: PatchAgreementDto) {
    return ok(await this.maintenance.patch(await this.user(req), id, body));
  }

  @Get('entries')
  async entries(@Req() req: Request, @Param('id') id: string, @Query() query: MonthQueryDto) {
    return ok(await this.maintenance.listEntries(await this.user(req), id, query.month));
  }

  @Post('entries')
  async createEntry(@Req() req: Request, @Param('id') id: string, @Body() body: CreateEntryDto) {
    return ok(await this.maintenance.createEntry(await this.user(req), id, body));
  }

  @Get('balance')
  async balance(@Req() req: Request, @Param('id') id: string, @Query() query: MonthQueryDto) {
    return ok(await this.maintenance.balance(await this.user(req), id, query.month));
  }
}
