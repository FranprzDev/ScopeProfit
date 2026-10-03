import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { web } from '@e2e-dev/web';
import type { E2EConfig, ModelInstance } from 'e2e';

const ZEN_MODEL = 'mimo-v2.6-flash-free';
const ZEN_BASE_URL = 'https://opencode.ai/zen/v1';

function modelWithoutKey(): ModelInstance {
  return {
    specificationVersion: 'v2',
    provider: 'opencode-zen',
    modelId: ZEN_MODEL,
    doGenerate() {
      throw new Error(
        'Falta OPENCODE_ZEN_API_KEY: exportala antes de correr pasos agénticos. Los tests que no usan agent.* no la necesitan.',
      );
    },
  };
}

function agentModel(): ModelInstance {
  const apiKey = process.env.OPENCODE_ZEN_API_KEY;
  if (!apiKey) return modelWithoutKey();
  const zen = createOpenAICompatible({
    name: 'opencode-zen',
    baseURL: ZEN_BASE_URL,
    apiKey,
  });
  return zen.chatModel(ZEN_MODEL);
}

export default {
  targets: [
    {
      name: 'web',
      engine: web(),
      app: {
        url: 'http://127.0.0.1:0',
        command: {
          executable: 'node',
          args: ['scripts/dev.mjs'],
          env: { PORT: '{port}' },
          startupTimeout: 180_000,
          shutdownTimeout: 15_000,
          log: '.e2e/logs/app.log',
        },
      },
    },
  ],
  workers: 1,
  retries: 0,
  agents: {
    default: {
      model: agentModel(),
      system:
        'Actuás como una persona probando la app en español rioplatense. Verificá el resultado en pantalla antes de terminar el paso y no esperes tiempos fijos.',
      context:
        'Scope to Profit (Next.js): /dashboard lista proyectos, cotizaciones y retainers del profesional; /p/[projectId] es el workspace con las secciones "Cotización" y "Mantenimiento"; /login ingresa por email mágico. Los errores de la API aparecen en role="alert".',
    },
  },
} satisfies E2EConfig;
