class GoogleMapsScraper {
  constructor(browserManager, database) {
    this.browser = browserManager;
    this.db = database;
    this.page = null;
  }

  /**
   * Initialize the scraper
   */
  async init() {
    this.page = await this.browser.launch(false); // Non-headless for first login
    await this.browser.navigateToSavedPlaces();
  }

  /**
   * Get all list names from the saved places page
   */
  async getListNames() {
    console.log('Fetching list names...');

    // Wait for lists to load
    await this.page.waitForTimeout(2000);

    // TODO: Update these selectors based on actual Google Maps DOM structure
    // This is a placeholder that needs to be adjusted after inspecting the page
    const lists = await this.page.$$eval('[role="list"] [role="listitem"]', (items) => {
      return items.map(item => {
        // Extract list name - needs to be adjusted based on actual structure
        const nameElement = item.querySelector('h2, h3, [class*="title"]');
        return nameElement ? nameElement.textContent.trim() : null;
      }).filter(Boolean);
    });

    console.log(`Found ${lists.length} lists:`, lists);
    return lists;
  }

  /**
   * Navigate to a specific list
   */
  async navigateToList(listName) {
    console.log(`Navigating to list: ${listName}`);

    // TODO: Find and click on the list
    // This is a placeholder that needs actual selectors
    const listButton = await this.page.$(`text="${listName}"`);
    if (listButton) {
      await listButton.click();
      await this.page.waitForTimeout(2000);
      return true;
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

    // TODO: Update these selectors based on actual Google Maps DOM structure
    while (scrollAttempts < maxScrollAttempts) {
      // Get currently visible places
      const newPlaces = await this.page.$$eval('[data-place-id], [data-item-id]', (items) => {
        return items.map(item => {
          try {
            // Extract place information - adjust selectors as needed
            const placeId = item.getAttribute('data-place-id') || item.getAttribute('data-item-id');
            const nameElement = item.querySelector('h3, [class*="name"]');
            const name = nameElement ? nameElement.textContent.trim() : 'Unknown';

            const linkElement = item.querySelector('a[href*="maps"]');
            const url = linkElement ? linkElement.href : null;

            const notesElement = item.querySelector('[class*="note"], [class*="description"]');
            const notes = notesElement ? notesElement.textContent.trim() : null;

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

      // Scroll down to load more
      const previousCount = places.length;
      await this.page.evaluate(() => {
        const scrollContainer = document.querySelector('[role="feed"], [class*="scroll"]');
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

    // Upsert list in database
    const listResult = this.db.upsertList(listName);
    const list = this.db.getListByName(listName);

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
          last_modified: new Date().toISOString(),
          last_synced: new Date().toISOString()
        };

        const result = this.db.upsertPlace(placeData);
        const dbPlace = this.db.getPlaceByGoogleId(place.google_place_id);

        // Associate place with list
        this.db.addPlaceToList(dbPlace.id, list.id);

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
      this.db.completeSync(syncId, totalPlacesSynced, lists.length, errors.length > 0 ? errors : null, status);

      console.log(`\n✓ Sync completed: ${totalPlacesSynced} places from ${lists.length} lists`);
      if (errors.length > 0) {
        console.log(`⚠️  Encountered ${errors.length} errors`);
      }

      return { totalPlacesSynced, listsCount: lists.length, errors };
    } catch (error) {
      this.db.completeSync(syncId, totalPlacesSynced, 0, [{ error: error.message }], 'failed');
      throw error;
    }
  }

  /**
   * Close the scraper
   */
  async close() {
    await this.browser.close();
  }
}

module.exports = GoogleMapsScraper;
