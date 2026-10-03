import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { ok, SESSION_COOKIE } from '../../response';
import { QuotesService } from './quotes.service';

@Controller('me')
export class MyQuotesController {
  constructor(
    private auth: AuthService,
    private quotes: QuotesService,
  ) {}

  @Get('quotes')
  async list(@Req() req: Request) {
    return ok(await this.quotes.listMine(await this.auth.session(req.cookies?.[SESSION_COOKIE])));
  }
}
