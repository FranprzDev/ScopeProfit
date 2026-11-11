import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { QuotesService } from '../pricing/quotes.service';
import { fail } from '../../security';
import { verifyExportTokenDetailed } from './export-links';

/** Serves the signed, expiring document and quote links returned by the MCP export tools. */
@Controller('exports')
export class ExportsController {
  constructor(
    private documents: DocumentsService,
    private quotes: QuotesService,
    private db: PrismaService,
  ) {}

  @Get(':token') async download(@Param('token') token: string, @Res() res: Response) {
    const result = verifyExportTokenDetailed(token);
    if (result.status === 'expired')
      fail(
        'EXPORT_LINK_EXPIRED',
        410,
        'This export link expired; ask the professional for a fresh export_document or export_quote link',
      );
    if (result.status !== 'ok') fail('INVALID_EXPORT_LINK', 404, 'Export link is invalid');
    const claim = result.claim;
    const file =
      claim.artifact === 'quote'
        ? await (() => {
            if (claim.format !== 'pdf' && claim.format !== 'docx') fail('INVALID_FORMAT', 400);
            return this.quotes.renderFile(claim.projectId, claim.format);
          })()
        : await this.documents.download(claim.projectId, claim.version, claim.format);
    await this.db.auditEvent
      .create({
        data: {
          projectId: claim.projectId,
          action: 'export.downloaded',
          result: 'success',
          metadata: { artifact: claim.artifact, version: claim.version, format: claim.format },
        },
      })
      .catch(() => undefined); // a failed audit write must not block the download
    res.setHeader('content-type', file.mimeType);
    res.setHeader('content-disposition', `attachment; filename="${file.name}"`);
    res.setHeader('cache-control', 'private, no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.send(file.buffer);
  }
}
