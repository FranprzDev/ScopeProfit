import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DocumentsService } from '../documents/documents.service';
import { fail } from '../../security';
import { verifyExportToken } from './export-links';

/** Serves the signed, expiring document links returned by the MCP `export_document` tool. */
@Controller('exports')
export class ExportsController {
  constructor(private documents: DocumentsService) {}

  @Get(':token') async download(@Param('token') token: string, @Res() res: Response) {
    const claim = verifyExportToken(token);
    if (!claim) fail('INVALID_EXPORT_LINK', 404, 'Export link is invalid or expired');
    const file = await this.documents.download(claim.projectId, claim.version, claim.format);
    res.setHeader('content-type', file.mimeType);
    res.setHeader('content-disposition', `attachment; filename="${file.name}"`);
    res.setHeader('cache-control', 'private, no-store');
    res.send(file.buffer);
  }
}
