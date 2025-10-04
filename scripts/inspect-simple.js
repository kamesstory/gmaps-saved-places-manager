#!/usr/bin/env node

const { exec } = require('child_process');
const { chromium } = require('playwright');
const path = require('path');

/**
 * Simple inspector - opens Google Maps in your default Chrome profile
 * This bypasses automation detection by using your real Chrome profile
 */

console.log('='.repeat(60));
console.log('Google Maps Inspector - Simple Mode');
console.log('='.repeat(60));
console.log('\nIMPORTANT: This will use your existing Chrome profile.');
console.log('Make sure Chrome is CLOSED before running this.\n');

// Wait 3 seconds to let user read
setTimeout(async () => {
  try {
    // Find Chrome user data directory
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    let chromeDataDir;

    if (process.platform === 'darwin') {
      chromeDataDir = path.join(homeDir, 'Library/Application Support/Google/Chrome');
    } else if (process.platform === 'win32') {
      chromeDataDir = path.join(homeDir, 'AppData/Local/Google/Chrome/User Data');
    } else {
      chromeDataDir = path.join(homeDir, '.config/google-chrome');
    }

    console.log(`Using Chrome profile: ${chromeDataDir}`);
    console.log('Launching browser...\n');

    const context = await chromium.launchPersistentContext(chromeDataDir, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1400, height: 900 },
      args: [
        '--disable-blink-features=AutomationControlled',
      ]
    });

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();

    console.log('Navigating to Google Maps saved places...');
    await page.goto('https://www.google.com/maps/saved', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('Waiting for content to load...');
    await page.waitForTimeout(10000);

    // Take screenshot
    const screenshotPath = path.join(__dirname, '../screenshots', `inspection-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\n📸 Screenshot saved: ${screenshotPath}\n`);

    // Run inspections
    console.log('='.repeat(60));
    console.log('RUNNING INSPECTIONS');
    console.log('='.repeat(60));

    await runInspections(page);

    console.log('\n' + '='.repeat(60));
    console.log('INSPECTION COMPLETE');
    console.log('='.repeat(60));
    console.log('\nBrowser will stay open for 2 minutes so you can inspect manually.');
    console.log('Press Ctrl+C to close early.\n');

    await page.waitForTimeout(120000);
    await context.close();

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure Chrome is completely closed');
    console.error('2. Try manually logging into Google Maps first');
    console.error('3. Check if your Chrome profile path is correct\n');
    process.exit(1);
  }
}, 3000);

async function runInspections(page) {
  // Check page title
  const title = await page.title();
  const url = page.url();

  console.log(`\n📄 Page Title: ${title}`);
  console.log(`📍 URL: ${url}\n`);

  if (title.includes('Error') || title.includes('404')) {
    console.log('❌ Page failed to load properly');
    return;
  }

  // Get page stats
  console.log('📊 Page Statistics:');
  console.log('-'.repeat(60));
  const stats = await page.evaluate(() => {
    return {
      totalLinks: document.querySelectorAll('a').length,
      mapsLinks: document.querySelectorAll('a[href*="maps"]').length,
      buttons: document.querySelectorAll('button').length,
      listItems: document.querySelectorAll('[role="listitem"]').length,
      articles: document.querySelectorAll('article').length,
      h2s: document.querySelectorAll('h2').length,
      h3s: document.querySelectorAll('h3').length,
    };
  });
  console.log(JSON.stringify(stats, null, 2));

  // Find lists
  console.log('\n📍 Finding Lists:');
  console.log('-'.repeat(60));
  const lists = await page.evaluate(() => {
    const results = [];

    // Try different selectors
    const selectors = [
      'button[aria-label*="list"]',
      'button[aria-label*="List"]',
      '[role="button"]',
      'h2',
      'h3'
    ];

    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      Array.from(elements).slice(0, 3).forEach(el => {
        const text = el.textContent.trim();
        if (text && text.length < 100) {
          results.push({
            selector: sel,
            text,
            ariaLabel: el.getAttribute('aria-label')
          });
        }
      });
    }

    return results.slice(0, 20);
  });
  console.log(JSON.stringify(lists, null, 2));

  // Find places
  console.log('\n📍 Finding Places:');
  console.log('-'.repeat(60));
  const places = await page.evaluate(() => {
    const results = [];

    // Try finding place links
    const links = document.querySelectorAll('a[href*="/maps/place/"], a[href*="@"]');
    Array.from(links).slice(0, 5).forEach((link, i) => {
      results.push({
        index: i,
        href: link.href.slice(0, 100),
        text: link.textContent.trim().slice(0, 50),
      });
    });

    return results;
  });
  console.log(JSON.stringify(places, null, 2));
}
