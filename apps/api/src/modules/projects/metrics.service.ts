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
      this.db.changeRequest.groupBy({
        by: ['classification', 'status'],
        where: { projectId },
        _count: { _all: true },
      }),
      this.db.timeEntry.aggregate({
        where: { projectId },
        _sum: { durationMinutes: true },
      }),
    ]);
    const brief = project.brief?.data ?? {};
    const firstMessage = messages[0]?.createdAt;
    const firstDocument = document?.versions[0]?.createdAt;
    let blockingQuestions = 0;
    for (const question of brief.questions ?? []) if (question.blocksEstimate) blockingQuestions++;
    const risksBySeverity: Record<string, number> = {};
    for (const risk of brief.risks ?? [])
      risksBySeverity[risk.severity] = (risksBySeverity[risk.severity] ?? 0) + 1;
    const briefCompleteness = [];
    for (const key of ['included', 'excluded', 'assumptions', 'acceptanceCriteria'])
      briefCompleteness.push({
        field: key,
        filled: Array.isArray(brief[key]) ? brief[key].length > 0 : Boolean(brief[key]),
      });
    let deliveredDocuments = 0;
    for (const version of document?.versions ?? [])
      if (version.status === 'delivered') deliveredDocuments++;
    const changeRequests: Record<string, number> = {};
    for (const change of changes) {
      const key = `${change.classification}.${change.status}`;
      changeRequests[key] = change._count._all;
    }
    return {
      projectId,
      timeToFirstDocumentMinutes:
        firstMessage && firstDocument
          ? Math.round((firstDocument.getTime() - firstMessage.getTime()) / 60000)
          : null,
      blockingQuestions,
      risksBySeverity,
      briefCompleteness,
      documents: {
        generated: document?.versions.length ?? 0,
        delivered: deliveredDocuments,
      },
      changeRequests,
      trackedMinutes: entries._sum.durationMinutes ?? 0,
    };
  }
}
