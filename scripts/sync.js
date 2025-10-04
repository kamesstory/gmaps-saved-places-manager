#!/usr/bin/env node

const GMapsDatabase = require('../src/database');
const BrowserManager = require('../src/browser');
const GoogleMapsScraper = require('../src/scraper');

/**
 * Main sync script
 * Usage: node scripts/sync.js [--full]
 */
async function main() {
  const args = process.argv.slice(2);
  const fullSync = args.includes('--full');

  console.log('='.repeat(60));
  console.log('Google Maps Saved Places Sync');
  console.log('='.repeat(60));
  console.log(`Sync type: ${fullSync ? 'FULL' : 'INCREMENTAL'}`);
  console.log('\n⚠️  IMPORTANT: Close all Chrome windows before continuing!');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
  console.log('='.repeat(60));

  // Give user time to close Chrome
  await new Promise(resolve => setTimeout(resolve, 5000));

  const db = new GMapsDatabase();
  const browserManager = new BrowserManager(null, true); // Use real Chrome profile
  const scraper = new GoogleMapsScraper(browserManager, db);

  try {
    // Initialize database
    console.log('\n[1/3] Initializing database...');
    db.init();

    // Initialize browser and navigate
    console.log('\n[2/3] Launching browser...');
    await scraper.init();

    // Perform sync
    console.log('\n[3/3] Starting sync...');
    const result = await scraper.syncAllLists(!fullSync);

    console.log('\n' + '='.repeat(60));
    console.log('SYNC COMPLETE');
    console.log('='.repeat(60));
    console.log(`Places synced: ${result.totalPlacesSynced}`);
    console.log(`Lists synced: ${result.listsCount}`);
    console.log(`Errors: ${result.errors.length}`);
    console.log('='.repeat(60));

    if (result.errors.length > 0) {
      console.log('\nErrors encountered:');
      result.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.listName || 'Unknown'}: ${err.error}`);
      });
    }

  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Clean up
    await scraper.close();
    db.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = main;
