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
  console.log(JSON.stringify({event: 'persistence_verified', projects: count, documentVersions: versions.length}));
} finally {
  await db.$disconnect();
}
