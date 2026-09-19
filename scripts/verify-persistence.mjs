import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
try {
  const count = await db.project.count();
  if (!count) throw new Error('No projects survived PostgreSQL restart');
  const versions = await db.documentVersion.findMany();
  if (!versions.length) throw new Error('No document versions survived PostgreSQL restart');
  const artifacts = versions.flatMap((version) => Object.values(version.artifacts ?? {}));
  if (artifacts.length < versions.length * 3)
    throw new Error('Expected Markdown, PDF and DOCX artifacts for every document version');
  for (const artifact of artifacts) {
    const file = await readFile(path.resolve(process.env.STORAGE_ROOT ?? 'storage', artifact.path));
    if (!file.length) throw new Error(`Empty persisted artifact: ${artifact.path}`);
  }
  console.log(
    JSON.stringify({
      event: 'persistence_verified',
      projects: count,
      documentVersions: versions.length,
      artifacts: artifacts.length,
    }),
  );
} finally {
  await db.$disconnect();
}
