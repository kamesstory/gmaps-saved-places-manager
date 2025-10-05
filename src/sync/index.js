const ChangeDetector = require("./change-detector");
const Merger = require("./merger");

/**
 * Sync Orchestrator - Coordinates the bidirectional sync process
 *
 * Flow:
 * 1. PULL: Scrape remote state (incremental: first 50/list)
 * 2. DETECT: Compare base vs local vs remote
 * 3. MERGE: Apply changes (local wins conflicts)
 * 4. PUSH: Execute pending operations (future)
 * 5. UPDATE: Save new base state
 */
class SyncOrchestrator {
  constructor(scraper, db) {
    this.scraper = scraper;
    this.db = db;
    this.changeDetector = new ChangeDetector(db);
    this.merger = new Merger(db);
  }

  /**
   * Quick sync - incremental pull of first 50 places per list
   */
  async quickSync() {
    console.log("\n" + "=".repeat(60));
    console.log("QUICK SYNC (Bidirectional - Incremental)");
    console.log("=".repeat(60));

    const syncId = this.db.startSync("quick");
    let stats = {
      placesPulled: 0,
      operationsPushed: 0,
      conflictsDetected: 0,
      status: "in_progress",
      errors: [],
    };

    try {
      // PHASE 1: PULL - Scrape remote state
      console.log("\n📥 PHASE 1: PULL (Scraping remote state)");
      console.log("-".repeat(60));

      const lists = await this.scraper.getListNames();
      console.log(`Found ${lists.length} lists\n`);

      const remoteState = {};

      for (const listName of lists) {
        try {
          console.log(`Scraping list: ${listName}`);

          // Navigate to list
          const navigated = await this.scraper.navigateToList(listName);
          if (!navigated) {
            console.warn(`  ⚠️  Could not navigate to list: ${listName}`);
            continue;
          }

          // Scrape first 50 places (incremental)
          const places = await this.scraper.scrapePlacesFromCurrentList(50);
          remoteState[listName] = places;
          stats.placesPulled += places.length;

          console.log(`  ✓ Scraped ${places.length} places\n`);

          // Random delay between lists
          await this.scraper.browser.randomDelay(1000, 2000);
        } catch (error) {
          console.error(`  ❌ Error scraping list ${listName}:`, error.message);
          stats.errors.push({
            list: listName,
            phase: "pull",
            error: error.message,
          });
        }
      }

      // PHASE 2: DETECT - Find changes
      console.log("\n🔍 PHASE 2: DETECT (Comparing states)");
      console.log("-".repeat(60));

      const allChanges = {
        notesChanges: [],
        associationChanges: [],
        conflicts: [],
      };

      for (const [listName, remotePlaces] of Object.entries(remoteState)) {
        try {
          console.log(`Detecting changes for: ${listName}`);
          const changes = this.changeDetector.detectChangesForList(
            listName,
            remotePlaces
          );

          allChanges.notesChanges.push(...changes.notesChanges);
          allChanges.associationChanges.push(...changes.associationChanges);
          allChanges.conflicts.push(...changes.conflicts);

          console.log(
            `  Notes: ${changes.notesChanges.length}, Associations: ${changes.associationChanges.length}, Conflicts: ${changes.conflicts.length}`
          );
        } catch (error) {
          console.error(
            `  ❌ Error detecting changes for ${listName}:`,
            error.message
          );
          stats.errors.push({
            list: listName,
            phase: "detect",
            error: error.message,
          });
        }
      }

      stats.conflictsDetected = allChanges.conflicts.length;

      // PHASE 3: MERGE - Apply changes
      console.log("\n🔀 PHASE 3: MERGE (Applying changes)");
      console.log("-".repeat(60));

      const mergeResult = this.merger.applyChanges(allChanges);

      // PHASE 4: PUSH - Execute pending operations (placeholder for now)
      console.log("\n📤 PHASE 4: PUSH (Executing pending operations)");
      console.log("-".repeat(60));
      console.log("⚠️  Write operations not yet implemented");
      console.log("Pending operations will be queued for future execution\n");

      const pendingOps = this.db.getPendingOperations();
      stats.operationsPushed = 0; // Will be implemented later
      console.log(`Queued ${pendingOps.length} operations for future push`);

      // Complete sync
      stats.status = stats.errors.length === 0 ? "success" : "partial";
      this.db.completeSync(syncId, stats);

      console.log("\n" + "=".repeat(60));
      console.log("✅ QUICK SYNC COMPLETE");
      console.log("=".repeat(60));
      console.log(`Places pulled: ${stats.placesPulled}`);
      console.log(`Changes applied: ${mergeResult.applied}`);
      console.log(`Conflicts resolved: ${mergeResult.conflicts}`);
      console.log(`Operations queued: ${pendingOps.length}`);
      console.log(`Errors: ${stats.errors.length}`);
      console.log("=".repeat(60));

      return stats;
    } catch (error) {
      stats.status = "failed";
      stats.errors.push({ phase: "sync", error: error.message });
      this.db.completeSync(syncId, stats);
      throw error;
    }
  }

  /**
   * Deep sync - full pull of all places in all lists
   */
  async deepSync() {
    console.log("\n" + "=".repeat(60));
    console.log("DEEP SYNC (Bidirectional - Full)");
    console.log("=".repeat(60));

    const syncId = this.db.startSync("deep");
    let stats = {
      placesPulled: 0,
      operationsPushed: 0,
      conflictsDetected: 0,
      status: "in_progress",
      errors: [],
    };

    try {
      // PHASE 1: PULL - Scrape all places from all lists
      console.log("\n📥 PHASE 1: PULL (Scraping all remote data)");
      console.log("-".repeat(60));
      console.log("⚠️  This may take a while...\n");

      const lists = await this.scraper.getListNames();
      const remoteState = {};

      for (const listName of lists) {
        try {
          console.log(`Scraping list: ${listName} (FULL)`);

          const navigated = await this.scraper.navigateToList(listName);
          if (!navigated) {
            console.warn(`  ⚠️  Could not navigate to list: ${listName}`);
            continue;
          }

          // Scrape ALL places (no limit)
          const places = await this.scraper.scrapePlacesFromCurrentList(null);
          remoteState[listName] = places;
          stats.placesPulled += places.length;

          console.log(`  ✓ Scraped ${places.length} places\n`);

          await this.scraper.browser.randomDelay(2000, 4000);
        } catch (error) {
          console.error(`  ❌ Error scraping list ${listName}:`, error.message);
          stats.errors.push({
            list: listName,
            phase: "pull",
            error: error.message,
          });
        }
      }

      // PHASE 2-4: Same as quick sync
      console.log("\n🔍 PHASE 2: DETECT (Comparing states)");
      console.log("-".repeat(60));

      const allChanges = {
        notesChanges: [],
        associationChanges: [],
        conflicts: [],
      };

      for (const [listName, remotePlaces] of Object.entries(remoteState)) {
        try {
          const changes = this.changeDetector.detectChangesForList(
            listName,
            remotePlaces
          );
          allChanges.notesChanges.push(...changes.notesChanges);
          allChanges.associationChanges.push(...changes.associationChanges);
          allChanges.conflicts.push(...changes.conflicts);
        } catch (error) {
          console.error(
            `  ❌ Error detecting changes for ${listName}:`,
            error.message
          );
          stats.errors.push({
            list: listName,
            phase: "detect",
            error: error.message,
          });
        }
      }

      stats.conflictsDetected = allChanges.conflicts.length;

      console.log("\n🔀 PHASE 3: MERGE (Applying changes)");
      console.log("-".repeat(60));

      const mergeResult = this.merger.applyChanges(allChanges);

      console.log("\n📤 PHASE 4: PUSH (Executing pending operations)");
      console.log("-".repeat(60));
      console.log("⚠️  Write operations not yet implemented\n");

      const pendingOps = this.db.getPendingOperations();
      stats.operationsPushed = 0;

      // Complete sync
      stats.status = stats.errors.length === 0 ? "success" : "partial";
      this.db.completeSync(syncId, stats);

      console.log("\n" + "=".repeat(60));
      console.log("✅ DEEP SYNC COMPLETE");
      console.log("=".repeat(60));
      console.log(`Places pulled: ${stats.placesPulled}`);
      console.log(`Changes applied: ${mergeResult.applied}`);
      console.log(`Conflicts resolved: ${mergeResult.conflicts}`);
      console.log(`Operations queued: ${pendingOps.length}`);
      console.log(`Errors: ${stats.errors.length}`);
      console.log("=".repeat(60));

      return stats;
    } catch (error) {
      stats.status = "failed";
      stats.errors.push({ phase: "sync", error: error.message });
      this.db.completeSync(syncId, stats);
      throw error;
    }
  }
}

module.exports = SyncOrchestrator;
