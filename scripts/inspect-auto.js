#!/usr/bin/env node

const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');

/**
 * Automatic DOM inspector for Google Maps
 * Runs all inspection strategies and outputs results
 */

async function main() {
  console.log('='.repeat(60));
  console.log('Google Maps DOM Inspector (Auto Mode)');
  console.log('='.repeat(60));
  console.log('This will run all inspection strategies and save results.\n');

  const userDataDir = path.resolve('./browser-data');

  console.log('Launching browser with stealth mode...');

  // Add stealth plugin
  chromium.plugins.setDependencyMap(new Map([
    ['stealth/evasions/chrome.app', stealth],
    ['stealth/evasions/chrome.csi', stealth],
    ['stealth/evasions/chrome.loadTimes', stealth],
    ['stealth/evasions/chrome.runtime', stealth],
    ['stealth/evasions/defaultArgs', stealth],
    ['stealth/evasions/iframe.contentWindow', stealth],
    ['stealth/evasions/media.codecs', stealth],
    ['stealth/evasions/navigator.hardwareConcurrency', stealth],
    ['stealth/evasions/navigator.languages', stealth],
    ['stealth/evasions/navigator.permissions', stealth],
    ['stealth/evasions/navigator.plugins', stealth],
    ['stealth/evasions/navigator.vendor', stealth],
    ['stealth/evasions/navigator.webdriver', stealth],
    ['stealth/evasions/sourceurl', stealth],
    ['stealth/evasions/user-agent-override', stealth],
    ['stealth/evasions/webgl.vendor', stealth],
    ['stealth/evasions/window.outerdimensions', stealth],
  ]));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1280, height: 720 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials'
    ]
  });

  const page = await context.newPage();

  console.log('Navigating to Google Maps saved places...');
  await page.goto('https://www.google.com/maps/saved', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  console.log('Waiting for page to fully load...');
  await page.waitForTimeout(8000);

  // Check if logged in
  const currentUrl = page.url();
  if (currentUrl.includes('accounts.google.com') || currentUrl.includes('ServiceLogin')) {
    console.log('\n⚠️  NOT LOGGED IN');
    console.log('Please log in manually in the browser window.');
    console.log('Once logged in and you see your saved places, press Ctrl+C and run this again.\n');
    console.log('Browser will stay open for 2 minutes...');
    await page.waitForTimeout(120000);
    await context.close();
    process.exit(0);
  }

  console.log('\n✓ Page loaded! Running inspections...\n');

  // Take initial screenshot
  const screenshotPath = path.join(__dirname, '../screenshots', `inspection-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot saved: ${screenshotPath}\n`);

  // Run list inspections
  console.log('='.repeat(60));
  console.log('FINDING LISTS');
  console.log('='.repeat(60));
  await findLists(page);

  // Wait a bit
  await page.waitForTimeout(2000);

  // Run place inspections
  console.log('\n' + '='.repeat(60));
  console.log('FINDING PLACES');
  console.log('='.repeat(60));
  await findPlaces(page);

  // Additional useful info
  console.log('\n' + '='.repeat(60));
  console.log('ADDITIONAL INFO');
  console.log('='.repeat(60));
  await getAdditionalInfo(page);

  console.log('\n' + '='.repeat(60));
  console.log('INSPECTION COMPLETE');
  console.log('='.repeat(60));
  console.log('Use the information above to update selectors in src/scraper.js');
  console.log('\nPress Ctrl+C to close or browser will auto-close in 60 seconds...');

  await page.waitForTimeout(60000);
  await context.close();
}

async function findLists(page) {
  // Strategy 1: Role-based
  console.log('\n📍 Strategy 1: Role-based (list/listitem)');
  console.log('-'.repeat(60));
  try {
    const result = await page.evaluate(() => {
      const items = document.querySelectorAll('[role="list"] [role="listitem"]');
      return Array.from(items).slice(0, 10).map((item, i) => ({
        index: i,
        text: item.textContent.trim().slice(0, 100),
        tagName: item.tagName,
        classes: item.className.slice(0, 100)
      }));
    });
    console.log(result.length > 0 ? JSON.stringify(result, null, 2) : '  ❌ No results');
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }

  // Strategy 2: Common selectors
  console.log('\n📍 Strategy 2: Common selectors (h2, h3, buttons)');
  console.log('-'.repeat(60));
  try {
    const result = await page.evaluate(() => {
      const lists = [];
      const selectors = ['h2', 'h3', 'button[aria-label]', '[class*="list"]'];
      for (const sel of selectors) {
        const elements = document.querySelectorAll(sel);
        Array.from(elements).slice(0, 5).forEach((el, i) => {
          const text = el.textContent.trim();
          if (text && text.length < 50 && text.length > 0) {
            lists.push({
              selector: sel,
              index: i,
              text,
              ariaLabel: el.getAttribute('aria-label'),
              classes: el.className.slice(0, 100)
            });
          }
        });
      }
      return lists.slice(0, 15);
    });
    console.log(result.length > 0 ? JSON.stringify(result, null, 2) : '  ❌ No results');
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }

  // Strategy 3: Text search
  console.log('\n📍 Strategy 3: Text-based search for common list names');
  console.log('-'.repeat(60));
  try {
    const result = await page.evaluate(() => {
      const commonLists = ['Want to go', 'Favorites', 'Starred places', 'Starred', 'Favorite'];
      const found = [];
      for (const listName of commonLists) {
        const xpath = `//*[contains(text(), "${listName}")]`;
        const iterator = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
        let node = iterator.iterateNext();
        let count = 0;
        while (node && count < 3) {
          found.push({
            listName,
            tagName: node.tagName,
            classes: node.className ? node.className.slice(0, 100) : '',
            text: node.textContent.trim().slice(0, 50)
          });
          node = iterator.iterateNext();
          count++;
        }
      }
      return found;
    });
    console.log(result.length > 0 ? JSON.stringify(result, null, 2) : '  ❌ No results');
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }

  // Strategy 4: Navigation
  console.log('\n📍 Strategy 4: Navigation elements');
  console.log('-'.repeat(60));
  try {
    const result = await page.evaluate(() => {
      const navItems = document.querySelectorAll('nav button, [role="navigation"] button, button[aria-label]');
      return Array.from(navItems).slice(0, 10).map((item, i) => ({
        index: i,
        text: item.textContent.trim().slice(0, 50),
        ariaLabel: item.getAttribute('aria-label'),
        classes: item.className.slice(0, 100)
      }));
    });
    console.log(result.length > 0 ? JSON.stringify(result, null, 2) : '  ❌ No results');
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }
}

async function findPlaces(page) {
  // Strategy 1: Data attributes
  console.log('\n📍 Strategy 1: Data attributes');
  console.log('-'.repeat(60));
  try {
    const result = await page.evaluate(() => {
      const items = document.querySelectorAll('[data-place-id], [data-item-id], [data-id]');
      return Array.from(items).slice(0, 5).map((item, i) => ({
        index: i,
        placeId: item.getAttribute('data-place-id') || item.getAttribute('data-item-id') || item.getAttribute('data-id'),
        text: item.textContent.trim().slice(0, 100),
        classes: item.className.slice(0, 100),
        hasLink: !!item.querySelector('a[href*="maps"]')
      }));
    });
    console.log(result.length > 0 ? JSON.stringify(result, null, 2) : '  ❌ No results');
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }

  // Strategy 2: Links
  console.log('\n📍 Strategy 2: Links to map places');
  console.log('-'.repeat(60));
  try {
    const result = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href*="/maps/place/"], a[href*="@"]');
      return Array.from(links).slice(0, 5).map((link, i) => {
        const parent = link.closest('[role="listitem"], [class*="item"], li, div[class*="place"]');
        return {
          index: i,
          href: link.href.slice(0, 100),
          text: link.textContent.trim().slice(0, 50),
          parentTag: parent?.tagName,
          parentClasses: parent?.className.slice(0, 100)
        };
      });
    });
    console.log(result.length > 0 ? JSON.stringify(result, null, 2) : '  ❌ No results');
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }

  // Strategy 3: Listitems
  console.log('\n📍 Strategy 3: Role listitem elements');
  console.log('-'.repeat(60));
  try {
    const result = await page.evaluate(() => {
      const items = document.querySelectorAll('[role="listitem"]');
      return Array.from(items).slice(0, 5).map((item, i) => {
        const nameEl = item.querySelector('h3, h2, [class*="name"], [class*="title"]');
        const linkEl = item.querySelector('a[href*="maps"]');
        const noteEl = item.querySelector('[class*="note"], [class*="description"], [class*="comment"]');
        return {
          index: i,
          name: nameEl?.textContent.trim().slice(0, 50),
          hasLink: !!linkEl,
          link: linkEl?.href?.slice(0, 100),
          hasNote: !!noteEl,
          note: noteEl?.textContent.trim().slice(0, 50),
          classes: item.className.slice(0, 100)
        };
      });
    });
    console.log(result.length > 0 ? JSON.stringify(result, null, 2) : '  ❌ No results');
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }

  // Strategy 4: Articles
  console.log('\n📍 Strategy 4: Article/Card elements');
  console.log('-'.repeat(60));
  try {
    const result = await page.evaluate(() => {
      const articles = document.querySelectorAll('article, [class*="card"], [class*="item"]');
      return Array.from(articles).slice(0, 5).map((item, i) => {
        const nameEl = item.querySelector('h1, h2, h3, h4');
        const linkEl = item.querySelector('a');
        return {
          index: i,
          tagName: item.tagName,
          name: nameEl?.textContent.trim().slice(0, 50),
          hasLink: !!linkEl,
          classes: item.className.slice(0, 100)
        };
      });
    });
    console.log(result.length > 0 ? JSON.stringify(result, null, 2) : '  ❌ No results');
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
  }
}

async function getAdditionalInfo(page) {
  console.log('\n📊 Page Statistics:');
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
      dataAttributes: Array.from(document.querySelectorAll('*')).filter(el =>
        Array.from(el.attributes).some(attr => attr.name.startsWith('data-'))
      ).length,
      title: document.title
    };
  });

  console.log(JSON.stringify(stats, null, 2));

  console.log('\n📍 Current URL:');
  console.log(page.url());
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = main;
