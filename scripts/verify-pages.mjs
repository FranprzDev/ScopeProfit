import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('verification-screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function main() {
  console.log('🚀 Starting Comprehensive Playwright Verification...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[Console Error]: ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`[Page Error]: ${err.message}`);
  });

  const targetPort = process.env.PORT || '3000';
  const baseUrl = `http://localhost:${targetPort}`;

  // 1. Landing Page Checks
  console.log(`🔍 Testing Landing Page (${baseUrl})...`);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  const title = await page.title();
  console.log(`✓ Page title: ${title}`);

  // Check H1
  const h1Text = await page.locator('h1').innerText();
  console.log(`✓ H1 text: "${h1Text.replace(/\n/g, ' ')}"`);

  // Screenshot Hero
  await page.screenshot({ path: path.join(outDir, '01-landing-hero.png') });

  // Sections of the MCP-first landing
  for (const id of ['que-hace', 'herramientas', 'conectar']) {
    const section = page.locator(`#${id}`);
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, `02-landing-${id}.png`) });
    console.log(`✓ Section #${id} rendered`);
  }

  const toolCount = await page.locator('#herramientas li').count();
  console.log(`✓ Found ${toolCount} MCP tools listed`);
  if (toolCount !== 15) consoleErrors.push(`[Check]: expected 15 MCP tools, found ${toolCount}`);

  // Full page screenshot of Landing
  await page.screenshot({ path: path.join(outDir, 'landing-fullpage.png'), fullPage: true });
  console.log('✓ Full page landing screenshot captured');

  // 2. Mobile Responsiveness Test (375x812)
  console.log('📱 Testing Mobile Viewport (375x812)...');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '03-landing-mobile.png') });

  console.log('\n================ VERIFICATION SUMMARY ================');
  console.log(`Total Console / Page Errors: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error('Errors:', consoleErrors);
  } else {
    console.log('🎉 0 Errors. Landing sections verified.');
  }
  console.log('Screenshots stored in:', outDir);
  console.log('======================================================\n');

  await browser.close();
  if (consoleErrors.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
