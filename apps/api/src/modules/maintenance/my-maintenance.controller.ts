import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { ok, SESSION_COOKIE } from '../../response';
import { MaintenanceService } from './maintenance.service';

@Controller('me')
export class MyMaintenanceController {
  constructor(
    private auth: AuthService,
    private maintenance: MaintenanceService,
  ) {}

  @Get('maintenance')
  async list(@Req() req: Request) {
    return ok(
      await this.maintenance.listMine(await this.auth.session(req.cookies?.[SESSION_COOKIE])),
    );
  }
}
