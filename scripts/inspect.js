#!/usr/bin/env node

const { chromium } = require('playwright');
const readline = require('readline');
const path = require('path');

/**
 * Interactive DOM inspector for Google Maps
 * Helps you find the correct selectors by inspecting the page structure
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('Google Maps DOM Inspector');
  console.log('='.repeat(60));
  console.log('This tool helps you find the correct DOM selectors.\n');

  const userDataDir = path.resolve('./browser-data');

  console.log('Launching browser...');
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  console.log('Navigating to Google Maps saved places...');
  await page.goto('https://www.google.com/maps/saved', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  await page.waitForTimeout(3000);

  console.log('\n✓ Page loaded!\n');
  console.log('Available commands:');
  console.log('  lists     - Find all list names');
  console.log('  places    - Find all places in current view');
  console.log('  click <selector> - Click an element');
  console.log('  eval <code> - Run JavaScript in the page');
  console.log('  screenshot - Take a screenshot');
  console.log('  html - Dump page HTML');
  console.log('  quit - Exit\n');

  let running = true;

  while (running) {
    const input = await question('> ');
    const [command, ...args] = input.trim().split(' ');

    try {
      switch (command) {
        case 'lists':
          await findLists(page);
          break;

        case 'places':
          await findPlaces(page);
          break;

        case 'click':
          if (args.length === 0) {
            console.log('Usage: click <selector>');
            break;
          }
          await page.click(args.join(' '));
          console.log('✓ Clicked');
          await page.waitForTimeout(2000);
          break;

        case 'eval':
          if (args.length === 0) {
            console.log('Usage: eval <javascript>');
            break;
          }
          const result = await page.evaluate(args.join(' '));
          console.log('Result:', result);
          break;

        case 'screenshot':
          const screenshotPath = path.join(__dirname, '../screenshots', `inspect-${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`✓ Screenshot saved: ${screenshotPath}`);
          break;

        case 'html':
          const html = await page.content();
          console.log(html);
          break;

        case 'quit':
        case 'exit':
          running = false;
          break;

        default:
          console.log('Unknown command. Type "quit" to exit.');
      }
    } catch (error) {
      console.error('Error:', error.message);
    }

    console.log('');
  }

  await context.close();
  rl.close();
  console.log('Goodbye!');
}

/**
 * Try different strategies to find list names
 */
async function findLists(page) {
  console.log('\nSearching for list names using different strategies...\n');

  const strategies = [
    // Strategy 1: Look for role="list" and listitem
    {
      name: 'Role-based (list/listitem)',
      code: `
        const items = document.querySelectorAll('[role="list"] [role="listitem"]');
        return Array.from(items).slice(0, 10).map((item, i) => ({
          index: i,
          text: item.textContent.trim().slice(0, 100),
          tagName: item.tagName,
          classes: item.className
        }));
      `
    },

    // Strategy 2: Look for common list selectors
    {
      name: 'Common selectors (h2, h3, buttons)',
      code: `
        const lists = [];
        const selectors = ['h2', 'h3', 'button[aria-label*="list"]', '[class*="list"]'];
        for (const sel of selectors) {
          const elements = document.querySelectorAll(sel);
          Array.from(elements).slice(0, 5).forEach((el, i) => {
            const text = el.textContent.trim();
            if (text && text.length < 50) {
              lists.push({ selector: sel, index: i, text, classes: el.className });
            }
          });
        }
        return lists.slice(0, 15);
      `
    },

    // Strategy 3: Find elements with "Want to go", "Favorites", etc.
    {
      name: 'Text-based search',
      code: `
        const commonLists = ['Want to go', 'Favorites', 'Starred places'];
        const found = [];
        for (const listName of commonLists) {
          const xpath = \`//*[contains(text(), "\${listName}")]\`;
          const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          if (result.singleNodeValue) {
            found.push({
              listName,
              tagName: result.singleNodeValue.tagName,
              classes: result.singleNodeValue.className,
              text: result.singleNodeValue.textContent.trim().slice(0, 50)
            });
          }
        }
        return found;
      `
    },

    // Strategy 4: Look for navigation items
    {
      name: 'Navigation elements',
      code: `
        const navItems = document.querySelectorAll('nav [role="button"], [role="navigation"] button, [class*="nav"] button');
        return Array.from(navItems).slice(0, 10).map((item, i) => ({
          index: i,
          text: item.textContent.trim().slice(0, 50),
          ariaLabel: item.getAttribute('aria-label'),
          classes: item.className
        }));
      `
    }
  ];

  for (const strategy of strategies) {
    console.log(`\n📍 ${strategy.name}:`);
    console.log('-'.repeat(60));
    try {
      const result = await page.evaluate(strategy.code);
      if (result.length === 0) {
        console.log('  No results found');
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }
}

/**
 * Try different strategies to find places
 */
async function findPlaces(page) {
  console.log('\nSearching for places using different strategies...\n');

  const strategies = [
    // Strategy 1: Data attributes
    {
      name: 'Data attributes (data-place-id, data-item-id)',
      code: `
        const items = document.querySelectorAll('[data-place-id], [data-item-id], [data-id]');
        return Array.from(items).slice(0, 5).map((item, i) => ({
          index: i,
          placeId: item.getAttribute('data-place-id') || item.getAttribute('data-item-id') || item.getAttribute('data-id'),
          text: item.textContent.trim().slice(0, 100),
          classes: item.className,
          hasLink: !!item.querySelector('a[href*="maps"]')
        }));
      `
    },

    // Strategy 2: Links to places
    {
      name: 'Links to map places',
      code: `
        const links = document.querySelectorAll('a[href*="/maps/place/"], a[href*="@"]');
        return Array.from(links).slice(0, 5).map((link, i) => {
          const parent = link.closest('[role="listitem"], [class*="item"], li, div[class*="place"]');
          return {
            index: i,
            href: link.href,
            text: link.textContent.trim().slice(0, 50),
            parentTag: parent?.tagName,
            parentClasses: parent?.className
          };
        });
      `
    },

    // Strategy 3: Role listitem
    {
      name: 'Role listitem elements',
      code: `
        const items = document.querySelectorAll('[role="listitem"]');
        return Array.from(items).slice(0, 5).map((item, i) => {
          const nameEl = item.querySelector('h3, h2, [class*="name"], [class*="title"]');
          const linkEl = item.querySelector('a[href*="maps"]');
          const noteEl = item.querySelector('[class*="note"], [class*="description"], [class*="comment"]');
          return {
            index: i,
            name: nameEl?.textContent.trim(),
            hasLink: !!linkEl,
            link: linkEl?.href,
            hasNote: !!noteEl,
            note: noteEl?.textContent.trim().slice(0, 50),
            classes: item.className
          };
        });
      `
    },

    // Strategy 4: Article tags (common for list items)
    {
      name: 'Article elements',
      code: `
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
      `
    }
  ];

  for (const strategy of strategies) {
    console.log(`\n📍 ${strategy.name}:`);
    console.log('-'.repeat(60));
    try {
      const result = await page.evaluate(strategy.code);
      if (result.length === 0) {
        console.log('  No results found');
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = main;
