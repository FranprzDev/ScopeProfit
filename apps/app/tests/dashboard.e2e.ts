import { afterEach, beforeEach, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { api } from './support/api';
import { PROFESSIONAL_EMAIL, signIn } from './support/auth';
import { closeDatabase } from './support/db';
import {
  briefFixture,
  cleanupTestData,
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

test('dashboard: lista la cotización enviada y el retainer activo', async ({
  app,
  browser,
  screen,
}) => {
  const session = await signIn(browser, PROFESSIONAL_EMAIL, 'professional');
  await ensureRateCard(session);
  const project = await createProject(session, `E2E dashboard ${new Date().toISOString()}`);
  await setBrief(session, project.id, briefFixture);
  await api(`/projects/${project.id}/quote/generate`, { method: 'POST', session, body: {} });
  await api(`/projects/${project.id}/quote/send`, { method: 'POST', session });
  await api(`/projects/${project.id}/maintenance`, {
    method: 'POST',
    session,
    body: {
      hoursPerMonth: 10,
      monthlyPrice: 1500,
      currency: 'USD',
      startDate: new Date().toISOString(),
    },
  });

  await app.open('/dashboard');
  const quotes = screen.getByRole('region', { name: 'Cotizaciones' });
  const maintenance = screen.getByRole('region', { name: 'Mantenimiento' });
  const quoteRow = quotes.getByRole('listitem').filter({ hasText: project.name });
  const maintenanceRow = maintenance.getByRole('listitem').filter({ hasText: project.name });

  await expect(quoteRow).toContainText('Enviada', { timeout: 15_000 });
  await expect(quoteRow).toContainText('$', { timeout: 15_000 });
  await expect(maintenanceRow).toContainText('Activo', { timeout: 15_000 });
  await expect(maintenanceRow).toContainText('10 h/mes', { timeout: 15_000 });
});
