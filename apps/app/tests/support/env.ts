import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoEnv = resolve(here, '../../../../.env');
if (existsSync(repoEnv)) process.loadEnvFile(repoEnv);

let baseUrl: string | undefined;

export function setAppBaseUrl(url: string | undefined): void {
  baseUrl = url;
}

export function appBaseUrl(): string {
  if (!baseUrl)
    throw new Error(
      'Falta el baseUrl de la app: registrá app.baseUrl en un beforeEach del test antes de usar la API o el navegador.',
    );
  return baseUrl.replace(/\/+$/, '');
}

export function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value)
    throw new Error(
      'Falta DATABASE_URL: exportala o dejala en el .env de la raíz del repo antes de correr la suite.',
    );
  return value;
}

export function authorizedTelegramId(): string {
  const first = (process.env.TELEGRAM_AUTHORIZED_USER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)[0];
  if (!first)
    throw new Error(
      'Falta TELEGRAM_AUTHORIZED_USER_IDS: arrancá la API y corré la suite con TELEGRAM_AUTHORIZED_USER_IDS=111.',
    );
  return first;
}
