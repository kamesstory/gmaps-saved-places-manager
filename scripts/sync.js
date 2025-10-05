#!/usr/bin/env node

const Database = require('../src/db');
const BrowserManager = require('../src/browser/browser-manager');
const GoogleMapsScraper = require('../src/sync/scraper');
const SyncOrchestrator = require('../src/sync');

/**
 * Main sync script - Bidirectional sync with three-way merge
 * Usage: node scripts/sync.js [--full]
 */
async function main() {
  const args = process.argv.slice(2);
  const fullSync = args.includes('--full');

  console.log('='.repeat(60));
  console.log('Google Maps Bidirectional Sync');
  console.log('='.repeat(60));
  console.log(`Sync type: ${fullSync ? 'DEEP (all places)' : 'QUICK (first 50/list)'}`);
  console.log('='.repeat(60));

  const db = new Database();
  const browserManager = new BrowserManager(); // Use browser-data/ like test-scraper
  const scraper = new GoogleMapsScraper(browserManager, db);
  const syncOrchestrator = new SyncOrchestrator(scraper, db);

  try {
    // Initialize database
    console.log('\n[1/4] Initializing database...');
    db.init();

    // Launch browser
    console.log('\n[2/4] Launching browser...');
    scraper.page = await browserManager.launch(false);

    // Navigate to saved places
    console.log('\n[3/4] Navigating to Google Maps Saved Places...');
    await browserManager.navigateToSavedPlaces();

    // Perform bidirectional sync
    console.log('\n[4/4] Starting bidirectional sync...');
    const result = fullSync
      ? await syncOrchestrator.deepSync()
      : await syncOrchestrator.quickSync();

    if (result.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      result.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.list || 'Unknown'} [${err.phase}]: ${err.error}`);
      });
    }

  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Clean up
    await browserManager.close();
    db.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = main;
