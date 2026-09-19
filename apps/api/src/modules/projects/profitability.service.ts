import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AuthService } from '../auth/auth.service';
import { fail } from '../../security';

@Injectable()
export class ProfitabilityService {
  constructor(
    private db: PrismaService,
    private auth: AuthService,
  ) {}

  async update(
    projectId: string,
    user: any,
    values: { priceCents?: number; externalCostCents?: number; internalRateCents?: number },
  ) {
    this.auth.professional(user);
    await this.auth.project(user, projectId);
    for (const value of Object.values(values))
      if (value !== undefined && (!Number.isInteger(value) || value < 0))
        fail('INVALID_FINANCIAL_VALUE', 400);
    return this.db.project.update({ where: { id: projectId }, data: values });
  }

  async get(projectId: string, user: any) {
    const project: any = await this.auth.project(user, projectId);
    let estimatedHours = 0;
    for (const estimate of project.brief?.data?.estimates ?? [])
      estimatedHours += (estimate.minHours + estimate.maxHours) / 2;
    const minutes = Math.round(estimatedHours * 60);
    const laborCostCents = project.internalRateCents
      ? Math.round((minutes / 60) * project.internalRateCents)
      : null;
    const totalCostCents =
      laborCostCents === null ? null : laborCostCents + (project.externalCostCents ?? 0);
    const marginCents =
      project.priceCents === null || totalCostCents === null
        ? null
        : project.priceCents - totalCostCents;
    return {
      projectId,
      priceCents: project.priceCents,
      externalCostCents: project.externalCostCents,
      internalRateCents: project.internalRateCents,
      estimatedMinutes: minutes,
      laborCostCents,
      totalCostCents,
      marginCents,
      marginPercent:
        project.priceCents && marginCents !== null ? marginCents / project.priceCents : null,
    };
  }
}
