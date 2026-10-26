import type { XmcpConfig } from 'xmcp';
import { INSTRUCTIONS } from './src/modules/mcp/instructions';

const config: XmcpConfig = {
  http: { cors: { origin: false } },
  stdio: { silent: true },
  paths: { tools: 'src/modules/mcp/tools', prompts: false, resources: false },
  experimental: { adapter: 'nestjs' },
  template: {
    name: 'scopeprofit',
    description: 'Versioned scope documents',
    instructions: INSTRUCTIONS,
    icons: [],
  },
  typescript: { ignoreBuildErrors: false },
  bundler: (config) => ({
    ...config,
    externals: [
      ...(Array.isArray(config.externals) ? config.externals : []),
      { '@prisma/client': 'commonjs @prisma/client', xmcp: 'commonjs xmcp' },
    ],
    output: { ...config.output, filename: '[name].js' },
  }),
};
export default config;
