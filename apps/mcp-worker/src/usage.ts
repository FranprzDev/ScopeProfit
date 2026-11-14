import { createHmac } from 'node:crypto';
import type { Container } from './container';

export type UsageOrigin = 'owner' | 'bot' | 'mcp_client' | 'unknown';

export interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

const BOT_UA =
  /bot|crawler|spider|slurp|uptime|health[- ]?check|pingdom|statuscake|datadog|newrelic|curl|wget|python-requests|go-http-client|postmanruntime/i;

export interface UsageDetails {
  method?: string;
  tool?: string;
  clientName?: string;
  apiKeyId?: string;
  userEmail?: string | null;
  ok: boolean;
}

function hmac(value: string): string {
  return createHmac('sha256', process.env.ENCRYPTION_KEY ?? 'scopeprofit-usage')
    .update(value)
    .digest('hex');
}

function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function classify(
  request: Request,
  details: { apiKeyId?: string; userEmail?: string | null },
): UsageOrigin {
  if (details.apiKeyId) {
    if (details.userEmail && ownerEmails().includes(details.userEmail.toLowerCase()))
      return 'owner';
    return 'mcp_client';
  }
  return BOT_UA.test(request.headers.get('user-agent') ?? '') ? 'bot' : 'unknown';
}

export function recordUsage(
  container: Container,
  ctx: WaitUntil,
  request: Request,
  details: UsageDetails,
): void {
  const day = new Date().toISOString().slice(0, 10);
  const originClass = classify(request, details);
  const keyHash = hmac(
    details.apiKeyId
      ? `key:${details.apiKeyId}`
      : `anon:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`,
  );
  const ua = request.headers.get('user-agent') ?? '';
  const sessionHash = hmac(`${keyHash}:${details.clientName ?? ''}:${ua}:${day}`);
  const write = (async () => {
    await container.db.usageEvent.create({
      data: {
        day: new Date(`${day}T00:00:00Z`),
        keyHash,
        originClass,
        clientName: details.clientName ?? null,
        sessionHash,
        tool: details.tool ?? null,
        ok: details.ok,
      },
    });
    if (!details.apiKeyId) return;
    if (details.method === 'initialize')
      await upsertConversion(container, keyHash, 'first_connect', day);
    if (details.tool === 'create_project' && details.ok)
      await upsertConversion(container, keyHash, 'first_scope', day);
  })().catch((error) => {
    console.error(
      `scopeprofit-mcp: usage write failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
  ctx.waitUntil(write);
}

async function upsertConversion(
  container: Container,
  keyHash: string,
  kind: string,
  day: string,
): Promise<void> {
  await container.db.usageConversion.upsert({
    where: { keyHash_kind: { keyHash, kind } },
    create: { keyHash, kind, firstDay: new Date(`${day}T00:00:00Z`) },
    update: {},
  });
}

export function recordConversion(
  container: Container,
  ctx: WaitUntil,
  apiKeyId: string,
  kind: string,
): void {
  const day = new Date().toISOString().slice(0, 10);
  const keyHash = hmac(`key:${apiKeyId}`);
  ctx.waitUntil(
    upsertConversion(container, keyHash, kind, day).catch((error) => {
      console.error(
        `scopeprofit-mcp: conversion write failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }),
  );
}
