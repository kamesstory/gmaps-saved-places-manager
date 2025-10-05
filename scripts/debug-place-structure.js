#!/usr/bin/env node

const BrowserManager = require("../src/browser/browser-manager");

/**
 * Debug script to inspect the actual structure of places
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Place Structure Debugger');
  console.log('='.repeat(60));

  const browserManager = new BrowserManager();
  let page;

  try {
    console.log('\n[1/3] Launching browser...');
    page = await browserManager.launch(false);

    console.log('\n[2/3] Navigating to Google Maps...');
    await page.goto("https://google.com/maps", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(5000);

    const savedButton = await page.$('button[jsaction*="navigationrail.saved"]');
    if (savedButton) {
      await savedButton.click();
      await page.waitForTimeout(5000);
    }

    // Click first list
    const listButtons = await page.$$("button.CsEnBe");
    if (listButtons.length > 0) {
      await listButtons[0].click();
      await page.waitForTimeout(5000);
    }

    console.log('\n[3/3] Analyzing place structure...');
    console.log('='.repeat(60));

    // Get detailed structure of first 5 places
    const placeStructures = await page.evaluate(() => {
      const containers = document.querySelectorAll('div.m6QErb.XiKgde');

      return Array.from(containers).slice(0, 5).map((container, index) => {
        // Try multiple strategies to find the name
        const strategies = {
          strategy1_fontHeadlineSmall: container.querySelector('div.fontHeadlineSmall.rZF81c')?.textContent?.trim(),
          strategy2_fontHeadlineSmall_any: container.querySelector('div.fontHeadlineSmall')?.textContent?.trim(),
          strategy3_h3: container.querySelector('h3')?.textContent?.trim(),
          strategy4_button_text: container.querySelector('button.SMP2wb.fHEb6e')?.textContent?.trim()?.split('\n')[0],
          strategy5_any_header: container.querySelector('h1, h2, h3, h4, h5')?.textContent?.trim(),
          strategy6_first_div_with_text: Array.from(container.querySelectorAll('div')).find(
            div => div.textContent.length > 0 && div.textContent.length < 100
          )?.textContent?.trim()?.split('\n')[0]
        };

        // Get all classes on the container
        const containerClasses = container.className;

        // Get structure info
        const hasButton = !!container.querySelector('button.SMP2wb.fHEb6e');
        const hasTextarea = !!container.querySelector('textarea');
        const hasImage = !!container.querySelector('img');

        return {
          index,
          containerClasses,
          hasButton,
          hasTextarea,
          hasImage,
          strategies,
          innerHTML: container.innerHTML.substring(0, 500) // First 500 chars
        };
      });
    });

    console.log('\nAnalyzed', placeStructures.length, 'places:\n');

    placeStructures.forEach(place => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Place ${place.index + 1}:`);
      console.log(`${'='.repeat(60)}`);
      console.log('\nName extraction strategies:');
      Object.entries(place.strategies).forEach(([strategy, value]) => {
        console.log(`  ${strategy}: ${value || '❌ NULL'}`);
      });
      console.log('\nStructure info:');
      console.log(`  Has button: ${place.hasButton}`);
      console.log(`  Has textarea: ${place.hasTextarea}`);
      console.log(`  Has image: ${place.hasImage}`);
      console.log(`  Container classes: ${place.containerClasses}`);
    });

    console.log('\n\n' + '='.repeat(60));
    console.log('RECOMMENDATION');
    console.log('='.repeat(60));

    // Determine which strategy worked best
    const workingStrategies = [];
    placeStructures.forEach(place => {
      Object.entries(place.strategies).forEach(([strategy, value]) => {
        if (value && value.length > 0) {
          if (!workingStrategies.includes(strategy)) {
            workingStrategies.push(strategy);
          }
        }
      });
    });

    console.log('\nWorking strategies:', workingStrategies);
    console.log('\nBrowser will stay open for 60 seconds...');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('\n❌ Debug failed:', error.message);
    console.error(error.stack);
  } finally {
    if (browserManager) {
      await browserManager.close();
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = main;
