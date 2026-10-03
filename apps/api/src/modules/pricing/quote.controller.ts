import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { IsArray, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { ok, SESSION_COOKIE } from '../../response';
import { QuotesService } from './quotes.service';

class GenerateQuoteDto {
  @IsOptional() @IsUUID() rateCardId?: string;
}

class PatchQuoteDto {
  @IsOptional() @IsString() @MaxLength(10000) terms?: string | null;
  @IsOptional() @IsISO8601() validUntil?: string | null;
  @IsOptional() @IsArray() lines?: unknown[];
  @IsOptional() @IsArray() milestones?: unknown[];
}

@Controller('projects/:id/quote')
export class QuoteController {
  constructor(
    private auth: AuthService,
    private quotes: QuotesService,
  ) {}
  private user(req: Request) {
    return this.auth.session(req.cookies?.[SESSION_COOKIE]);
  }

  @Get()
  async get(@Req() req: Request, @Param('id') id: string) {
    return ok(await this.quotes.get(await this.user(req), id));
  }

  @Post('generate')
  async generate(@Req() req: Request, @Param('id') id: string, @Body() body: GenerateQuoteDto) {
    return ok(await this.quotes.generate(await this.user(req), id, body.rateCardId));
  }

  @Patch()
  async patch(@Req() req: Request, @Param('id') id: string, @Body() body: PatchQuoteDto) {
    return ok(await this.quotes.patch(await this.user(req), id, body));
  }
}
