/**
 * Builds the ScopeProfit domain-service graph for one Worker isolate, reusing the exact
 * classes the Nest API uses (apps/api/src/modules/*). Only the edges that cannot run on
 * Workers are substituted at build time: filesystem storage -> R2, sharp image decode,
 * pele/resvg diagrams, the LangGraph agent loop, and the Prisma engine (workerd client over
 * Neon's serverless driver). Instances are cached per isolate across requests.
 */
import { PrismaService } from './shims/prisma';
import { StorageService } from './shims/r2-storage';
import { AgentService } from './shims/agent-stub';
import { EmailService } from '../../api/src/email.service';
import { AuthService } from '../../api/src/modules/auth/auth.service';
import { ProjectsService } from '../../api/src/modules/projects/projects.service';
import { DocumentsService } from '../../api/src/modules/documents/documents.service';
import { ChangeRequestsService } from '../../api/src/modules/projects/change-requests.service';
import { QuotesService } from '../../api/src/modules/pricing/quotes.service';
import { RateCardsService } from '../../api/src/modules/pricing/rate-cards.service';
import { ApiKeysService } from '../../api/src/modules/mcp/api-keys.service';
import { ScopeToolsService } from '../../api/src/modules/mcp/scope-tools.service';
import { ScopeProfitOAuthProvider } from '../../api/src/modules/mcp/oauth.provider';

export interface WorkerEnv {
  DATABASE_URL: string;
  ENCRYPTION_KEY: string;
  STORAGE?: R2Bucket;
  STORAGE_KV?: KVNamespace;
  PUBLIC_API_URL: string;
  WEB_URL?: string;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  MCP_RATE_LIMIT_PER_MINUTE?: string;
}

export interface Container {
  db: PrismaService;
  tools: ScopeToolsService;
  provider: ScopeProfitOAuthProvider;
  keys: ApiKeysService;
  documents: DocumentsService;
  quotes: QuotesService;
}

let cache: Container | undefined;

export function getContainer(env: WorkerEnv): Container {
  if (cache) return cache;
  const db = new PrismaService(env.DATABASE_URL);
  const email = new EmailService();
  // R2 when the account enables it (STORAGE binding), Workers KV otherwise (STORAGE_KV).
  const storage = new StorageService((env.STORAGE ?? env.STORAGE_KV) as never) as never;
  const auth = new AuthService(db, email);
  const projects = new ProjectsService(db, auth);
  const documents = new DocumentsService(db, storage, email);
  const agent = new AgentService(db) as never;
  const changes = new ChangeRequestsService(db, auth);
  const rateCards = new RateCardsService(db, auth);
  const quotes = new QuotesService(db, auth, rateCards);
  const keys = new ApiKeysService(db, auth);
  const tools = new ScopeToolsService(
    db,
    auth,
    projects,
    documents,
    agent,
    storage,
    changes,
    quotes,
  );
  const provider = new ScopeProfitOAuthProvider(db, keys);
  cache = { db, tools, provider, keys, documents, quotes };
  return cache;
}
