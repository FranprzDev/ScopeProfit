import { createContext } from 'xmcp';
import type { User } from '@prisma/client';
import type { ScopeToolsService } from './scope-tools.service';

interface ScopeToolContext {
  tools: ScopeToolsService;
  user: User;
  authenticate?: () => Promise<User>;
}

export const scopeToolContext = createContext<ScopeToolContext>({
  name: 'scopeprofit-tools',
  fallback: false,
});

export const stdioToolContext = createContext<ScopeToolContext>({
  name: 'scopeprofit-stdio-tools',
  fallback: true,
});

export function getScopeToolContext(): ScopeToolContext {
  try {
    return scopeToolContext.getContext();
  } catch {
    return stdioToolContext.getContext();
  }
}
