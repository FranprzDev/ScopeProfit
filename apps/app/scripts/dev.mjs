import net from 'net';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');
const lockFile = path.join(webDir, '.next', 'dev', 'lock');

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function testPort(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    try {
      server.listen(port, host);
    } catch {
      resolve(false);
    }
  });
}

async function isPortFree(port) {
  const v4 = await testPort(port, '127.0.0.1');
  if (!v4) return false;
  const all = await testPort(port, '0.0.0.0');
  if (!all) return false;
  return true;
}

async function findAvailablePort(startPort = 3000, maxAttempts = 30) {
  for (let p = startPort; p < startPort + maxAttempts; p++) {
    if (await isPortFree(p)) {
      return p;
    }
  }
  return startPort;
}

async function handleExistingLock() {
  if (fs.existsSync(lockFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (data.pid && isPidAlive(data.pid)) {
        console.log(`\n\x1b[33m⚠️  Instancia anterior de ScopeProfit activa (PID ${data.pid}) en puerto ${data.port}.\x1b[0m`);
        console.log(`\x1b[90mReiniciando proceso para liberar puerto...\x1b[0m`);
        try {
          process.kill(data.pid, 'SIGTERM');
          await new Promise((r) => setTimeout(r, 600));
          if (isPidAlive(data.pid)) {
            process.kill(data.pid, 'SIGKILL');
            await new Promise((r) => setTimeout(r, 300));
          }
        } catch {}
      }
      try {
        fs.unlinkSync(lockFile);
      } catch {}
    } catch {}
  }
}

async function run() {
  await handleExistingLock();

  const desiredPort = parseInt(process.env.PORT || '3000', 10);
  const selectedPort = await findAvailablePort(desiredPort);

  if (selectedPort !== desiredPort) {
    console.log(`\n\x1b[33m⚡ Puerto ${desiredPort} ocupado por otra aplicación.\x1b[0m`);
    console.log(`\x1b[32m✔  Asignando automáticamente puerto libre: http://localhost:${selectedPort}\x1b[0m\n`);
  } else {
    console.log(`\n\x1b[32m✔  Puerto ${selectedPort} libre. Iniciando en http://localhost:${selectedPort}\x1b[0m\n`);
  }

  const child = spawn(
    'npx',
    ['next', 'dev', '-p', String(selectedPort), '--hostname', '0.0.0.0'],
    {
      cwd: webDir,
      stdio: 'inherit',
      env: { ...process.env, PORT: String(selectedPort) }
    }
  );

  const forward = (sig) => {
    if (child.pid) child.kill(sig);
  };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

run().catch((err) => {
  console.error('Error fatal al iniciar servidor web:', err);
  process.exit(1);
});
