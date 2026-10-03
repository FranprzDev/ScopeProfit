import { Body, Controller, Get, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { QuoteStatus } from '@prisma/client';
import { IsArray, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { ok, SESSION_COOKIE } from '../../response';
import { QuotesService, type QuoteDecision } from './quotes.service';

class GenerateQuoteDto {
  @IsOptional() @IsUUID() rateCardId?: string;
}

class PatchQuoteDto {
  @IsOptional() @IsString() @MaxLength(10000) terms?: string | null;
  @IsOptional() @IsISO8601() validUntil?: string | null;
  @IsOptional() @IsArray() lines?: unknown[];
  @IsOptional() @IsArray() milestones?: unknown[];
}

class QuoteDecisionDto {
  @IsIn([QuoteStatus.accepted, QuoteStatus.rejected]) decision!: QuoteDecision;
}

@Controller('projects/:id/quote')
export class QuoteController {
  constructor(
    private auth: AuthService,
    private quotes: QuotesService,
  ) {}
  private token(req: Request) {
    return (req.headers['x-project-token'] as string) || undefined;
  }
  private user(req: Request) {
    return this.auth.session(req.cookies?.[SESSION_COOKIE]);
  }
  private optionalUser(req: Request) {
    const raw = req.cookies?.[SESSION_COOKIE] as string | undefined;
    return raw ? this.auth.session(raw) : Promise.resolve(null);
  }

  @Get()
  async get(@Req() req: Request, @Param('id') id: string) {
    return ok(await this.quotes.get(await this.optionalUser(req), id, this.token(req)));
  }

  @Post('generate')
  async generate(@Req() req: Request, @Param('id') id: string, @Body() body: GenerateQuoteDto) {
    return ok(await this.quotes.generate(await this.user(req), id, body.rateCardId));
  }

  @Post('send')
  async send(@Req() req: Request, @Param('id') id: string) {
    return ok(await this.quotes.send(await this.user(req), id));
  }

  @Post('decision')
  async decision(@Req() req: Request, @Param('id') id: string, @Body() body: QuoteDecisionDto) {
    return ok(
      await this.quotes.decide(await this.optionalUser(req), id, this.token(req), body.decision),
    );
  }

  @Patch()
  async patch(@Req() req: Request, @Param('id') id: string, @Body() body: PatchQuoteDto) {
    return ok(await this.quotes.patch(await this.user(req), id, body));
  }

  @Get(':format')
  async download(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('format') format: string,
    @Res() res: Response,
  ) {
    const file = await this.quotes.download(
      await this.optionalUser(req),
      id,
      format,
      this.token(req),
    );
    res.setHeader('content-type', file.mimeType);
    res.setHeader('content-disposition', `attachment; filename="${file.name}"`);
    res.send(file.buffer);
  }
}
