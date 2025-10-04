#!/usr/bin/env node

const BrowserManager = require("../src/browser");

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
    console.log("\n[1/4] Launching browser...");
    page = await browserManager.launch(false);

    // Navigate to saved places (goes to maps, then clicks Saved)
    console.log("\n[2/4] Navigating to Google Maps...");

    console.log("Going to google.com/maps...");
    await page.goto("https://google.com/maps", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    console.log("Waiting for Maps to load...");
    await page.waitForTimeout(5000);

    console.log("Looking for Saved button...");
    try {
      const savedButton = await page.$(
        'button[jsaction*="navigationrail.saved"]'
      );

      if (savedButton) {
        console.log("Clicking Saved button...");
        await savedButton.click();
        await page.waitForTimeout(5000);
        console.log("✅ Navigated to Saved places");
      } else {
        console.log(
          "⚠️  Could not find Saved button - please click it manually"
        );
        await page.waitForTimeout(15000);
      }
    } catch (error) {
      console.log(`⚠️  Error: ${error.message}`);
      console.log('Please click "Saved" manually in the browser');
      await page.waitForTimeout(15000);
    }

    // Test 1: Get list names
    console.log("\n[3/4] Testing list detection...");
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

    // Test 2: Click first list and get places
    if (lists.length > 0) {
      console.log("\n[4/4] Testing place detection...");
      console.log("-".repeat(60));
      console.log(`Clicking on first list: "${lists[0]}"...`);

      // Find and click the first list button
      const listButtons = await page.$$("button.CsEnBe");
      if (listButtons.length > 0) {
        await listButtons[0].click();
        await page.waitForTimeout(5000); // Wait for places to load

        // Try to get places
        const places = await page.$$eval("div.m6QErb.XiKgde", (items) => {
          return items.slice(0, 5).map((item, index) => {
            try {
              const nameElement = item.querySelector(
                "div.fontHeadlineSmall.rZF81c"
              );
              const name = nameElement
                ? nameElement.textContent.trim()
                : "Unknown";

              const placeButton = item.querySelector("button.SMP2wb.fHEb6e");
              const jslogAttr = placeButton?.getAttribute("jslog");

              const notesElement = item.querySelector(
                'textarea.MP5iJf[aria-label="Note"]'
              );
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
          });
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
        console.log("\n📜 Testing scroll behavior...");
        const countBefore = places.length;

        await page.evaluate(() => {
          const scrollContainer = document.querySelector(
            '[role="feed"], [class*="scroll"]'
          );
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          } else {
            window.scrollTo(0, document.body.scrollHeight);
          }
        });

        await page.waitForTimeout(3000);

        const placesAfterScroll = await page.$$("div.m6QErb.XiKgde");
        console.log(`   Before scroll: ${countBefore} places`);
        console.log(`   After scroll: ${placesAfterScroll.length} places`);

        if (placesAfterScroll.length > countBefore) {
          console.log("   ✅ Scroll working - more places loaded");
        } else {
          console.log(
            "   ⚠️  No new places after scroll (may be at end of list)"
          );
        }
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
