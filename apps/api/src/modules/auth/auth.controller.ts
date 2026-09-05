import { Body, Controller, Get, Post, Put, Query, Req, Res } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { fail } from '../../security';
import { ok, SESSION_COOKIE, sessionCookieOptions } from '../../response';

class MagicLinkRequestDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsOptional() @IsString() @MaxLength(64) projectId?: string;
  @IsOptional() @IsString() @MaxLength(200) linkToken?: string;
}
class ApiKeyDto { @IsString() @MinLength(10) @MaxLength(512) apiKey!: string; }

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('magic-link/request') async request(@Body() body: MagicLinkRequestDto) {
    return ok(await this.auth.request(body.email, body.projectId, body.linkToken));
  }

  @Get('magic-link/verify') async verify(@Query('token') token: string, @Res() res: Response) {
    if (!token) fail('INVALID_MAGIC_LINK', 401);
    const { sessionToken, redirect } = await this.auth.verify(token);
    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions);
    res.redirect(302, `${process.env.WEB_URL}${redirect}`);
  }

  @Get('admin/verify') async verifyAdmin(@Query('token') token: string, @Res() res: Response) {
    if (!token) fail('INVALID_ADMIN_LINK', 401);
    const { sessionToken, redirect } = await this.auth.verifyAdmin(token);
    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions);
    res.redirect(302, `${process.env.WEB_URL}${redirect}`);
  }

  @Get('me') async me(@Req() req: Request) {
    const user = await this.auth.session(req.cookies?.[SESSION_COOKIE]);
    return ok(this.auth.publicUser(user));
  }

  @Post('logout') async logout(@Req() req: Request, @Res() res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json(ok({ loggedOut: true }));
  }

  @Put('ai-key') async aiKey(@Req() req: Request, @Body() body: ApiKeyDto) {
    const user = await this.auth.session(req.cookies?.[SESSION_COOKIE]);
    return ok(await this.auth.saveKey(user, body.apiKey));
  }
}
