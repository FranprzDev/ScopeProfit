import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Serves the OpenAPI UI at /docs and the document at /docs-json. Not affected by the /api prefix. */
export function setupApiDocs(app: INestApplication) {
  const config = new DocumentBuilder().setTitle('ScopeProfit API').setVersion('1.0').build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
}
