import { afterEach, beforeEach, test } from '@e2e-dev/web';
import { expect } from 'e2e';
import type { MaintenanceBalance } from '@scopeprofit/contracts';
import { api } from './support/api';
import { PROFESSIONAL_EMAIL, signIn } from './support/auth';
import { closeDatabase } from './support/db';
import { cleanupTestData, createProject, todayIso } from './support/data';
import { setAppBaseUrl } from './support/env';

beforeEach(async ({ app }) => {
  setAppBaseUrl(app.baseUrl);
});

afterEach(async () => {
  await cleanupTestData();
  await closeDatabase();
});

test('retainer: se crea, se registra un consumo y el balance queda en verde', async ({
  app,
  browser,
  screen,
}) => {
  const session = await signIn(browser, PROFESSIONAL_EMAIL, 'professional');
  const project = await createProject(session, `E2E retainer ${new Date().toISOString()}`);

  await app.open(`/p/${project.id}`);
  const section = screen.getByRole('region', { name: 'Mantenimiento' });
  await expect(section.getByRole('heading', { name: 'Mantenimiento' })).toBeVisible();

  await section.getByRole('button', { name: 'Crear retainer' }).click();
  await section.getByLabel('Horas por mes').fill('10');
  await section.getByLabel('Moneda').fill('USD');
  await section.getByLabel('Fecha de inicio').fill(todayIso());
  await section.getByRole('button', { name: 'Crear retainer' }).last().click();

  const stats = section.getByRole('listitem');
  await expect(stats.filter({ hasText: 'Horas del retainer' })).toContainText('0', {
    timeout: 15_000,
  });
  await expect(stats.filter({ hasText: 'Restantes' })).toContainText('10', { timeout: 15_000 });

  await section.getByLabel('Fecha').fill(todayIso());
  await section.getByLabel('Horas').fill('2');
  await section.getByLabel('Descripción').fill('Ajuste de estilos en el reporte mensual');
  await section.getByRole('button', { name: 'Registrar consumo' }).click();

  await expect(stats.filter({ hasText: 'Horas del retainer' })).toContainText('2', {
    timeout: 15_000,
  });
  await expect(stats.filter({ hasText: 'Restantes' })).toContainText('8', { timeout: 15_000 });
  await expect(stats.filter({ hasText: 'Consumos' })).toContainText('1', { timeout: 15_000 });
  await expect(section.getByText('Ajuste de estilos en el reporte mensual')).toBeVisible();

  const balance = await api<MaintenanceBalance>(`/projects/${project.id}/maintenance/balance`, {
    session,
  });
  expect(balance.remaining).toBe(8);
  expect(balance.entriesCount).toBe(1);
});
