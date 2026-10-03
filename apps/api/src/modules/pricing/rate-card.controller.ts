import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { ok, SESSION_COOKIE } from '../../response';
import { RateCardsService } from './rate-cards.service';

class UpsertRateCardDto {
  @IsString() @IsNotEmpty() @MaxLength(200) label!: string;
  @IsNumber() @Min(0.01) hourlyRate!: number;
  @IsString() @Matches(/^[A-Za-z]{3}$/) currency!: string;
  @IsInt() @Min(0) @Max(100) marginPercent!: number;
}

@Controller('me')
export class RateCardController {
  constructor(
    private auth: AuthService,
    private rateCards: RateCardsService,
  ) {}
  private user(req: Request) {
    return this.auth.session(req.cookies?.[SESSION_COOKIE]);
  }

  @Get('rate-card')
  async get(@Req() req: Request) {
    return ok(await this.rateCards.get(await this.user(req)));
  }

  @Put('rate-card')
  async upsert(@Req() req: Request, @Body() body: UpsertRateCardDto) {
    return ok(await this.rateCards.upsert(await this.user(req), body));
  }
}
