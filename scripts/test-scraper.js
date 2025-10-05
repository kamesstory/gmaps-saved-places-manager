#!/usr/bin/env node

const BrowserManager = require("../src/browser/browser-manager");

/**
 * Test scraper - validates selectors without full sync
 * Usage: node scripts/test-scraper.js [--no-wait]
 */
async function main() {
  const args = process.argv.slice(2);
  const autoClose = args.includes('--no-wait');

  console.log("=".repeat(60));
  console.log("Google Maps Scraper Test");
  console.log("=".repeat(60));
  console.log("This will test the scraper without modifying the database.\n");

  const browserManager = new BrowserManager(); // Use separate profile in browser-data/
  let page;

  try {
    // Launch browser
    console.log("\n[1/3] Launching browser...");
    page = await browserManager.launch(false);

    // Navigate to saved places using BrowserManager method
    console.log("\n[2/3] Navigating to Google Maps Saved Places...");
    await browserManager.navigateToSavedPlaces();

    // Test 1: Get list names
    console.log("\n[3/3] Testing list detection...");
    console.log("-".repeat(60));

    const lists = await page.$$eval("button.CsEnBe", (buttons) => {
      return buttons
        .map((button) => {
          const nameElement = button.querySelector("div.Io6YTe.fontBodyLarge");
          return nameElement ? nameElement.textContent.trim() : null;
        })
        .filter(Boolean);
    });

    if (lists.length === 0) {
      console.log("❌ No lists found! Selectors may be incorrect.");
    } else {
      console.log(`✅ Found ${lists.length} lists:`);
      lists.forEach((list, i) => {
        console.log(`   ${i + 1}. ${list}`);
      });
    }

    // Test 2: Click "Want to go" list (or first list if not found)
    if (lists.length > 0) {
      console.log("\nTesting place detection and scraping...");
      console.log("-".repeat(60));

      // Try to find "Want to go" list
      let targetList = "Want to go";
      let targetIndex = lists.findIndex(list => list.toLowerCase().includes("want to go"));

      if (targetIndex === -1) {
        targetIndex = 0;
        targetList = lists[0];
        console.log(`⚠️  "Want to go" not found, using first list: "${targetList}"`);
      } else {
        console.log(`Clicking on list: "${targetList}" (index ${targetIndex})...`);
      }

      // Find and click the target list button
      const listButtons = await page.$$("button.CsEnBe");
      if (listButtons.length > targetIndex) {
        await listButtons[targetIndex].click();
        await page.waitForTimeout(5000); // Wait for places to load

        // Try to get places (with robust selectors)
        const places = await page.$$eval("div.m6QErb.XiKgde", (items) => {
          return items.map((item, index) => {
            try {
              // Only process real places (those with the place button)
              const placeButton = item.querySelector("button.SMP2wb.fHEb6e");
              if (!placeButton) {
                return null; // Skip non-place items
              }

              // Extract name with fallback strategies
              let name = null;
              let nameElement = item.querySelector("div.fontHeadlineSmall.rZF81c");
              if (nameElement) {
                name = nameElement.textContent.trim();
              }

              if (!name) {
                nameElement = item.querySelector("div.fontHeadlineSmall");
                if (nameElement) name = nameElement.textContent.trim();
              }

              if (!name && placeButton.textContent) {
                const buttonText = placeButton.textContent.trim().split('\n')[0];
                if (buttonText && buttonText.length > 0 && buttonText.length < 100) {
                  name = buttonText;
                }
              }

              if (!name) {
                return null; // Skip if no name found
              }

              const jslogAttr = placeButton.getAttribute("jslog");

              const notesElement = item.querySelector('textarea.MP5iJf[aria-label="Note"]') ||
                                  item.querySelector('textarea[aria-label="Note"]') ||
                                  item.querySelector('textarea');
              const notes = notesElement ? notesElement.value.trim() : null;

              return {
                index,
                name,
                hasJslog: !!jslogAttr,
                hasNotes: !!notes,
                noteLength: notes ? notes.length : 0,
              };
            } catch (error) {
              return { error: error.message };
            }
          }).filter(Boolean).slice(0, 5); // Get first 5 real places
        });

        if (places.length === 0) {
          console.log("❌ No places found! Selectors may be incorrect.");
        } else {
          console.log(`✅ Found ${places.length} places (showing first 5):`);
          places.forEach((place) => {
            if (place.error) {
              console.log(`   ❌ Error: ${place.error}`);
            } else {
              console.log(`   ${place.index + 1}. ${place.name}`);
              console.log(`      - Has jslog: ${place.hasJslog ? "✅" : "❌"}`);
              console.log(
                `      - Has notes: ${place.hasNotes ? "✅" : "❌"} (${
                  place.noteLength
                } chars)`
              );
            }
          });
        }

        // Try scrolling and see if we get more
        console.log("\n📜 Testing scroll behavior and virtualization...");

        // Count real places before scroll
        let realPlacesBefore = await page.$$eval("div.m6QErb.XiKgde", (items) => {
          return items.filter(item => !!item.querySelector("button.SMP2wb.fHEb6e")).length;
        });

        console.log(`   Real places before scroll: ${realPlacesBefore}`);

        // Scroll multiple times to test virtualization
        for (let i = 0; i < 3; i++) {
          const scrollInfo = await page.evaluate(() => {
            // Try multiple scroll container strategies
            let scrollContainer = document.querySelector('[role="feed"]');

            if (!scrollContainer) {
              // Find the scrollable div that contains places
              const allDivs = Array.from(document.querySelectorAll('div'));
              scrollContainer = allDivs.find(div => {
                const style = window.getComputedStyle(div);
                return (style.overflowY === 'scroll' || style.overflowY === 'auto') &&
                       div.scrollHeight > div.clientHeight;
              });
            }

            if (scrollContainer) {
              const beforeScroll = scrollContainer.scrollTop;
              scrollContainer.scrollTop = scrollContainer.scrollHeight;
              const afterScroll = scrollContainer.scrollTop;
              return {
                found: true,
                scrolled: afterScroll > beforeScroll,
                scrollTop: afterScroll,
                scrollHeight: scrollContainer.scrollHeight
              };
            } else {
              window.scrollTo(0, document.body.scrollHeight);
              return { found: false };
            }
          });

          console.log(`   Scroll attempt ${i + 1}: ${scrollInfo.found ? `scrollTop=${scrollInfo.scrollTop}` : 'No container found, using window scroll'}`);

          await page.waitForTimeout(2000);

          const realPlacesAfter = await page.$$eval("div.m6QErb.XiKgde", (items) => {
            return items.filter(item => !!item.querySelector("button.SMP2wb.fHEb6e")).length;
          });

          console.log(`   After scroll ${i + 1}: ${realPlacesAfter} real places`);

          if (realPlacesAfter > realPlacesBefore) {
            console.log(`   ✅ Loaded ${realPlacesAfter - realPlacesBefore} more places`);
            realPlacesBefore = realPlacesAfter;
          } else {
            console.log("   ⏸️  No new places loaded (may have reached end)");
            break;
          }
        }

        // Final summary
        const totalContainers = await page.$$eval("div.m6QErb.XiKgde", items => items.length);
        const totalRealPlaces = await page.$$eval("div.m6QErb.XiKgde", (items) => {
          return items.filter(item => !!item.querySelector("button.SMP2wb.fHEb6e")).length;
        });

        console.log(`\n   📊 Final stats:`);
        console.log(`   Total containers: ${totalContainers}`);
        console.log(`   Real places: ${totalRealPlaces}`);
        console.log(`   Non-place items filtered: ${totalContainers - totalRealPlaces}`);
        console.log(`   ✅ Virtualization handling: ${totalRealPlaces > 5 ? 'WORKING' : 'NEEDS MORE SCROLLING'}`);
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("TEST COMPLETE");
    console.log("=".repeat(60));

    if (lists.length > 0) {
      console.log("✅ Scraper appears to be working!");
      console.log("\nNext steps:");
      console.log("1. Review the output above");
      console.log("2. If everything looks good, run: npm run sync");
      console.log(
        '3. Check the database: sqlite3 db/gmaps.db "SELECT * FROM places LIMIT 5;"'
      );
    } else {
      console.log("❌ Scraper needs debugging");
      console.log("\nTroubleshooting:");
      console.log("1. Check if you're logged into Google Maps");
      console.log("2. Manually inspect the page structure again");
      console.log("3. Update selectors in src/scraper.js");
    }

    if (!autoClose) {
      console.log(
        "\nBrowser will stay open for 180 seconds for manual inspection..."
      );
      console.log("(Use --no-wait flag to auto-close)");
      await page.waitForTimeout(180000);
    } else {
      console.log("\n✅ Auto-closing browser...");
    }
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Clean up
    if (browserManager) {
      await browserManager.close();
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = main;
