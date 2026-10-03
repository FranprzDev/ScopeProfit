import { afterEach, beforeEach, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import type { Quote } from '@scopeprofit/contracts';
import { api } from './support/api';
import { CLIENT_EMAIL, PROFESSIONAL_EMAIL, signIn } from './support/auth';
import { closeDatabase } from './support/db';
import {
  briefFixture,
  cleanupTestData,
  clientToken,
  createProject,
  ensureRateCard,
  setBrief,
} from './support/data';
import { setAppBaseUrl } from './support/env';

beforeEach(async ({ app }) => {
  setAppBaseUrl(app.baseUrl);
});

afterEach(async () => {
  await cleanupTestData();
  await closeDatabase();
});

test('cotización: se genera desde el Brief, se envía y el cliente la acepta', async ({
  app,
  browser,
  screen,
}) => {
  const professional = await signIn(browser, PROFESSIONAL_EMAIL, 'professional');
  await ensureRateCard(professional);
  const project = await createProject(professional, `E2E cotización ${new Date().toISOString()}`);
  const token = clientToken(project);
  await setBrief(professional, project.id, briefFixture);

  await app.open(`/p/${project.id}`);
  await expect(screen.getByRole('heading', { level: 1, name: project.name })).toBeVisible();
  const section = screen.getByRole('region', { name: 'Cotización' });
  await section.getByRole('button', { name: 'Generar desde Brief' }).click();
  await expect(section.getByText('Borrador', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(section.getByText('Panel de administración')).toBeVisible();

  await browser.onDialog('accept');
  await section.getByRole('button', { name: 'Enviar' }).click();
  await expect(section.getByText('Enviada', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(section.getByText(/Enviada el/)).toBeVisible();

  const download = await browser.waitForDownload(
    () => section.getByRole('button', { name: /^PDF/ }).click(),
    { timeout: 20_000 },
  );
  expect(download.suggestedFilename).toMatch(/^cotizacion-.+\.pdf$/);

  const client = await signIn(browser, CLIENT_EMAIL, 'client');
  await app.open(`/p/${project.id}?token=${encodeURIComponent(token)}`);
  const clientSection = screen.getByRole('region', { name: 'Cotización' });
  await browser.onDialog('accept');
  await clientSection.getByRole('button', { name: 'Aceptar propuesta' }).click();
  await expect(clientSection.getByText('Aceptada', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(clientSection.getByText(/Aceptaste esta propuesta/)).toBeVisible();

  const quote = await api<Quote>(`/projects/${project.id}/quote`, {
    session: client,
    token,
  });
  expect(quote.status).toBe('accepted');
});
