import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class MetricsService {
  constructor(
    private db: PrismaService,
    private auth: AuthService,
  ) {}

  async get(projectId: string, user: any) {
    const project: any = await this.auth.project(user, projectId);
    const [messages, document, changes, entries] = await Promise.all([
      this.db.message.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.db.document.findUnique({
        where: { projectId },
        include: { versions: { orderBy: { version: 'asc' } } },
      }),
      this.db.changeRequest.findMany({
        where: { projectId },
        select: { classification: true, status: true },
      }),
      this.db.timeEntry.findMany({ where: { projectId }, select: { durationMinutes: true } }),
    ]);
    const brief = project.brief?.data ?? {};
    const firstMessage = messages[0]?.createdAt;
    const firstDocument = document?.versions[0]?.createdAt;
    return {
      projectId,
      timeToFirstDocumentMinutes:
        firstMessage && firstDocument
          ? Math.round((firstDocument.getTime() - firstMessage.getTime()) / 60000)
          : null,
      blockingQuestions: (brief.questions ?? []).filter((question: any) => question.blocksEstimate)
        .length,
      risksBySeverity: (brief.risks ?? []).reduce((counts: Record<string, number>, risk: any) => {
        counts[risk.severity] = (counts[risk.severity] ?? 0) + 1;
        return counts;
      }, {}),
      briefCompleteness: ['included', 'excluded', 'assumptions', 'acceptanceCriteria'].map(
        (key) => ({
          field: key,
          filled: Array.isArray(brief[key]) ? brief[key].length > 0 : Boolean(brief[key]),
        }),
      ),
      documents: {
        generated: document?.versions.length ?? 0,
        delivered:
          document?.versions.filter((version) => version.status === 'delivered').length ?? 0,
      },
      changeRequests: changes.reduce((counts: Record<string, number>, change) => {
        const key = `${change.classification}.${change.status}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
      trackedMinutes: entries.reduce((total, entry) => total + (entry.durationMinutes ?? 0), 0),
    };
  }
}
