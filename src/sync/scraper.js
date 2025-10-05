class GoogleMapsScraper {
  constructor(browserManager, database) {
    this.browser = browserManager;
    this.db = database;
    this.page = null;
  }


  /**
   * Get all list names from the saved places page
   * Excludes shared lists (under "Lists you saved" section) and system lists
   */
  async getListNames() {
    console.log('Fetching list names...');

    // Wait for lists to load
    await this.page.waitForTimeout(3000);

    // Find the "Lists you saved" header to know where shared lists start
    const sharedListsStartIndex = await this.page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('h2 .fontHeadlineSmall'));
      const sharedHeader = headers.find(h => h.textContent.includes('Lists you saved'));

      if (!sharedHeader) {
        return -1; // No shared lists section
      }

      // Find the index of the first button after this header
      const allButtons = Array.from(document.querySelectorAll('button.CsEnBe'));
      const headerPosition = sharedHeader.getBoundingClientRect().top;

      return allButtons.findIndex(button =>
        button.getBoundingClientRect().top > headerPosition
      );
    });

    // System lists to exclude (Google's default lists we can't manage)
    const systemLists = ['Starred places', 'Saved places'];

    // Get all list buttons
    const lists = await this.page.$$eval('button.CsEnBe', (buttons, cutoffIndex) => {
      return buttons
        .map((button, index) => {
          // Skip if this is in the shared lists section
          if (cutoffIndex !== -1 && index >= cutoffIndex) {
            return null;
          }

          const nameElement = button.querySelector('div.Io6YTe.fontBodyLarge');
          return nameElement ? nameElement.textContent.trim() : null;
        })
        .filter(Boolean);
    }, sharedListsStartIndex);

    // Filter out system lists
    const filteredLists = lists.filter(name => !systemLists.includes(name));

    console.log(`Found ${filteredLists.length} lists (excluding ${lists.length - filteredLists.length} shared/system lists)`);
    return filteredLists;
  }

  /**
   * Navigate back to the main Saved Places list view
   */
  async navigateBackToLists() {
    // Click the back button or navigate to saved places URL
    try {
      const backButton = await this.page.$('button[aria-label="Back"]');
      if (backButton) {
        await backButton.click();
        await this.page.waitForTimeout(2000);
      } else {
        // Fallback: click Saved button again
        await this.browser.navigateToSavedPlaces();
      }
    } catch (error) {
      console.warn('Could not navigate back, trying Saved button...');
      await this.browser.navigateToSavedPlaces();
    }
  }

  /**
   * Navigate to a specific list
   */
  async navigateToList(listName) {
    console.log(`Navigating to list: ${listName}`);

    // Get all list buttons
    const listButtons = await this.page.$$('button.CsEnBe');

    // Find the one matching our list name
    for (const button of listButtons) {
      const nameElement = await button.$('div.Io6YTe.fontBodyLarge');
      if (nameElement) {
        const text = await nameElement.textContent();
        if (text && text.trim() === listName) {
          await button.click();
          await this.page.waitForTimeout(3000); // Wait for places to load
          return true;
        }
      }
    }

    console.warn(`Could not find list: ${listName}`);
    return false;
  }

  /**
   * Scrape places from current list view
   * @param {number} limit - Maximum number of places to scrape (for incremental sync)
   */
  async scrapePlacesFromCurrentList(limit = null) {
    console.log(`Scraping places from current list (limit: ${limit || 'none'})...`);

    const places = [];
    let scrollAttempts = 0;
    const maxScrollAttempts = limit ? Math.ceil(limit / 10) : 50; // Adjust based on items per scroll

    // Find place containers - use jsaction attribute (more stable than specific classes)
    // All real places have buttons with jsaction containing "pane.wfvdle" and jslog with metadata
    while (scrollAttempts < maxScrollAttempts) {
      // Get currently visible places
      const newPlaces = await this.page.$$eval('button[jsaction*="pane.wfvdle"][jslog*="metadata"]', (buttons) => {
        return buttons.map((placeButton, index) => {
          try {
            // Additional filter: must have jslog with metadata (real places)
            const jslogAttr = placeButton.getAttribute('jslog');
            if (!jslogAttr || !jslogAttr.includes('metadata')) {
              return null;
            }

            // Extract place name - try multiple strategies for robustness
            let name = null;

            // Strategy 1: div with class containing "fontHeadlineSmall" (most reliable but flexible)
            let nameElement = placeButton.querySelector('div[class*="fontHeadlineSmall"]');
            if (nameElement) {
              name = nameElement.textContent.trim();
            }

            // Strategy 2: Extract from button text (first line, before rating)
            if (!name && placeButton.textContent) {
              const buttonText = placeButton.textContent.trim().split('\n')[0];
              // Extract text before rating (e.g., "Restaurant4.5" -> "Restaurant")
              const textBeforeRating = buttonText.split(/\d\.\d/)[0];
              if (textBeforeRating && textBeforeRating.length > 0 && textBeforeRating.length < 100) {
                name = textBeforeRating.trim();
              }
            }

            // Strategy 3: Look for any header-like element (h1-h6) or div with "headline" in class
            if (!name) {
              nameElement = placeButton.querySelector('h1, h2, h3, h4, h5, h6, div[class*="headline"]');
              if (nameElement) {
                name = nameElement.textContent.trim().split('\n')[0];
              }
            }

            // Skip if we still couldn't find a name
            if (!name || name.length === 0) {
              return null;
            }

            // Generate a unique ID from the button's jslog metadata
            const placeId = jslogAttr.match(/metadata:\[([^\]]+)\]/)?.[1] || `place_${index}_${name.replace(/\s+/g, '_')}`;

            // Try to extract URL from button onclick or jsaction
            // For now, we'll construct it from the place name as a fallback
            const url = `https://www.google.com/maps/search/${encodeURIComponent(name)}`;

            // Get notes from textarea - use stable aria-label attribute
            const container = placeButton.closest('div');
            const notesElement = container?.querySelector('textarea[aria-label="Note"]') ||
                                container?.querySelector('textarea[maxlength="4000"]') ||
                                container?.querySelector('textarea');
            const notes = notesElement ? notesElement.value.trim() : null;

            return {
              google_place_id: placeId,
              google_maps_url: url,
              name,
              notes
            };
          } catch (error) {
            return null;
          }
        }).filter(Boolean);
      });

      // Add new places that we haven't seen yet
      for (const place of newPlaces) {
        if (!places.find(p => p.google_place_id === place.google_place_id)) {
          places.push(place);
          if (limit && places.length >= limit) {
            break;
          }
        }
      }

      if (limit && places.length >= limit) {
        break;
      }

      // Scroll down to load more (robust scroll strategy)
      const previousCount = places.length;
      await this.page.evaluate(() => {
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
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        } else {
          window.scrollTo(0, document.body.scrollHeight);
        }
      });

      await this.browser.randomDelay(1500, 2500);

      // Check if we got new items
      if (places.length === previousCount) {
        scrollAttempts++;
      } else {
        scrollAttempts = 0; // Reset if we found new items
      }

      console.log(`Scraped ${places.length} places so far...`);
    }

    console.log(`Total places scraped: ${places.length}`);
    return places;
  }

  /**
   * Sync a specific list to database
   */
  async syncList(listName, incremental = true) {
    console.log(`\nSyncing list: ${listName} (${incremental ? 'incremental' : 'full'})`);

    // Navigate to the list
    const navigated = await this.navigateToList(listName);
    if (!navigated) {
      throw new Error(`Could not navigate to list: ${listName}`);
    }

    // Upsert list in database (using new repository pattern)
    this.db.lists.upsert(listName);
    const list = this.db.lists.findByName(listName);

    // Scrape places (limit to 50 for incremental, unlimited for full)
    const limit = incremental ? 50 : null;
    const places = await this.scrapePlacesFromCurrentList(limit);

    // Save places to database
    let savedCount = 0;
    for (const place of places) {
      try {
        const placeData = {
          google_place_id: place.google_place_id,
          google_maps_url: place.google_maps_url,
          name: place.name,
          notes: place.notes,
          last_synced: new Date().toISOString()
        };

        // Repository automatically calculates notes_hash
        this.db.places.upsert(placeData);
        const dbPlace = this.db.places.findByGoogleId(place.google_place_id);

        // Associate place with list
        this.db.placeLists.add(dbPlace.id, list.id);

        savedCount++;
      } catch (error) {
        console.error(`Error saving place ${place.name}:`, error.message);
      }
    }

    console.log(`✓ Synced ${savedCount} places from list: ${listName}`);
    return { listName, placesSynced: savedCount };
  }

  /**
   * Sync all lists
   */
  async syncAllLists(incremental = true) {
    const syncId = this.db.startSync(incremental ? 'incremental' : 'full');
    const errors = [];
    let totalPlacesSynced = 0;

    try {
      // Get all lists
      const lists = await this.getListNames();
      console.log(`\nStarting sync of ${lists.length} lists...\n`);

      // Sync each list
      for (const listName of lists) {
        try {
          const result = await this.syncList(listName, incremental);
          totalPlacesSynced += result.placesSynced;

          // Random delay between lists
          await this.browser.randomDelay(2000, 4000);
        } catch (error) {
          console.error(`Error syncing list ${listName}:`, error.message);
          errors.push({ listName, error: error.message });
        }
      }

      // Complete sync
      const status = errors.length === 0 ? 'success' : (errors.length < lists.length ? 'partial' : 'failed');
      this.db.completeSync(syncId, {
        placesPulled: totalPlacesSynced,
        status,
        errors: errors.length > 0 ? errors : []
      });

      console.log(`\n✓ Sync completed: ${totalPlacesSynced} places from ${lists.length} lists`);
      if (errors.length > 0) {
        console.log(`⚠️  Encountered ${errors.length} errors`);
      }

      return { totalPlacesSynced, listsCount: lists.length, errors };
    } catch (error) {
      this.db.completeSync(syncId, {
        placesPulled: totalPlacesSynced,
        status: 'failed',
        errors: [{ error: error.message }]
      });
      throw error;
    }
  }

}

module.exports = GoogleMapsScraper;
