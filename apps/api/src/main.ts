import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { ApiErrorHandler } from './api-error-handler';
import { csrfProtection } from './csrf';
import { isMcpRoute, mountMcp } from './modules/mcp/mcp-http';

const REQUIRED_ENV_VARS = ['WEB_URL', 'DATABASE_URL', 'ENCRYPTION_KEY'] as const;

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function bootstrap() {
  validateEnv();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) =>
    isMcpRoute(req.path) ? next() : csrfProtection(req, res, next),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.setGlobalPrefix('api', { exclude: [{ path: 'mcp', method: RequestMethod.ALL }] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiErrorHandler());
  app.enableCors({ origin: process.env.WEB_URL, credentials: true });
  if (process.env.TRUST_PROXY_HOPS)
    app.getHttpAdapter().getInstance().set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
  mountMcp(app);
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
