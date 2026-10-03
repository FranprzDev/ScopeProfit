import { emptyBrief, type BriefData, type Project } from '@scopeprofit/contracts';
import { api } from './api';
import { query } from './db';
import { TEST_EMAILS } from './auth';

export type ProjectWithClientUrl = Project & { clientUrl: string };

export const briefFixture: BriefData = {
  ...emptyBrief(),
  summary: 'Portal de clientes con reportes mensuales y panel de administración.',
  estimates: [
    { module: 'Panel de administración', minHours: 40, maxHours: 60, uncertainty: 'media' },
  ],
};

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const trackedProjects = new Set<string>();

export async function createProject(session: string, name: string): Promise<ProjectWithClientUrl> {
  const project = await api<ProjectWithClientUrl>('/projects', {
    method: 'POST',
    session,
    body: { name },
  });
  if (!project.clientUrl) throw new Error('POST /projects no devolvió clientUrl');
  trackedProjects.add(project.id);
  return project;
}

export function clientToken(project: ProjectWithClientUrl): string {
  const token = new URL(project.clientUrl).searchParams.get('token');
  if (!token) throw new Error('clientUrl sin token');
  return token;
}

export async function ensureRateCard(session: string): Promise<void> {
  await api('/me/rate-card', {
    method: 'PUT',
    session,
    body: { label: 'Tarifa E2E', hourlyRate: 50, currency: 'USD', marginPercent: 20 },
  });
}

export async function setBrief(session: string, projectId: string, data: BriefData) {
  await api(`/projects/${projectId}/brief`, {
    method: 'PATCH',
    session,
    body: { expectedVersion: 0, data },
  });
}

export async function cleanupTestData(): Promise<void> {
  for (const projectId of trackedProjects)
    await query('DELETE FROM projects WHERE id = $1', [projectId]);
  trackedProjects.clear();
  for (const email of TEST_EMAILS) {
    await query('DELETE FROM magic_links WHERE email = $1', [email]);
    await query('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = $1)', [
      email,
    ]);
  }
}
