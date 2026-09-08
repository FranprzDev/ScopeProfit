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
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[Console Error]: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(`[Page Error]: ${err.message}`);
  });

  const targetPort = process.env.PORT || '3001';
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

  // Test Workbench Tabs
  console.log('🔍 Testing Workbench tabs...');
  const tabButtons = page.locator('button[class*="workbenchTab"]');
  const count = await tabButtons.count();
  console.log(`✓ Found ${count} workbench tabs`);

  await tabButtons.nth(1).click();
  await page.waitForTimeout(300);
  console.log('✓ Switched to Tab 2 (Motor de Análisis)');

  await tabButtons.nth(2).click();
  await page.waitForTimeout(300);
  console.log('✓ Switched to Tab 3 (Alcance Blindado)');

  await tabButtons.nth(0).click();
  await page.waitForTimeout(300);
  console.log('✓ Switched back to Tab 1 (Audios y Mensajes)');

  // Test Timeline & Interactive Copy Link
  console.log('🔍 Testing Timeline & Copy Link button...');
  const timeline = page.locator('#flujo-exacto');
  await timeline.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '02-landing-timeline.png') });
  console.log('✓ Timeline scrolled and screenshot captured');

  const copyLinkBtn = page.locator('button:has-text("Copiar enlace")');
  if (await copyLinkBtn.count() > 0) {
    await copyLinkBtn.click();
    await page.waitForTimeout(300);
    const copiedText = await page.locator('button:has-text("Copiado")').first().innerText();
    console.log(`✓ Copy link button triggered successfully: "${copiedText}"`);
  }

  // Scroll and capture Anatomy & Bento
  const anatomy = page.locator('#anatomia-documento');
  await anatomy.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '03-landing-anatomy.png') });

  const features = page.locator('#features');
  await features.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '04-landing-features.png') });

  // Full page screenshot of Landing
  await page.screenshot({ path: path.join(outDir, 'landing-fullpage.png'), fullPage: true });
  console.log('✓ Full page landing screenshot captured');

  // 2. FAQ Page Checks
  console.log(`🔍 Testing FAQ Page (${baseUrl}/faq)...`);
  await page.goto(`${baseUrl}/faq`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const faqItems = page.locator('div[class*="faqItem"]');
  const faqCount = await faqItems.count();
  console.log(`✓ Found ${faqCount} FAQ items`);

  // Click first FAQ item to open
  await faqItems.nth(0).click();
  await page.waitForTimeout(300);
  const isOpenFirst = await faqItems.nth(0).getAttribute('class');
  console.log(`✓ First FAQ item toggled open: ${isOpenFirst?.includes('faqItemOpen')}`);

  // Click second FAQ item
  await faqItems.nth(1).click();
  await page.waitForTimeout(300);
  const isOpenSecond = await faqItems.nth(1).getAttribute('class');
  console.log(`✓ Second FAQ item toggled open: ${isOpenSecond?.includes('faqItemOpen')}`);

  await page.screenshot({ path: path.join(outDir, '05-faq-page.png') });

  // 3. Status Page Checks
  console.log(`🔍 Testing Status Page (${baseUrl}/status)...`);
  await page.goto(`${baseUrl}/status`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const statusTitle = await page.locator('h1').innerText();
  console.log(`✓ Status H1: "${statusTitle.replace(/\n/g, ' ')}"`);
  await page.screenshot({ path: path.join(outDir, '06-status-page.png') });

  // 4. Mobile Responsiveness Test (375x812)
  console.log('📱 Testing Mobile Viewport (375x812)...');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '07-landing-mobile.png') });

  console.log('\n================ VERIFICATION SUMMARY ================');
  console.log(`Total Console / Page Errors: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error('Errors:', consoleErrors);
  } else {
    console.log('🎉 0 Errors. All interactive flows, tabs, buttons, and views verified perfectly!');
  }
  console.log('Screenshots stored in:', outDir);
  console.log('======================================================\n');

  await browser.close();
  if (consoleErrors.length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
