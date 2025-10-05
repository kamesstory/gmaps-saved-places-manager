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
  console.log('\n⚠️  IMPORTANT: Close all Chrome windows before continuing!');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
  console.log('='.repeat(60));

  // Give user time to close Chrome
  await new Promise(resolve => setTimeout(resolve, 5000));

  const db = new Database();
  const browserManager = new BrowserManager(null, true); // Use real Chrome profile
  const scraper = new GoogleMapsScraper(browserManager, db);
  const syncOrchestrator = new SyncOrchestrator(scraper, db);

  try {
    // Initialize database
    console.log('\n[1/3] Initializing database...');
    db.init();

    // Initialize browser and navigate
    console.log('\n[2/3] Launching browser...');
    await scraper.init();

    // Perform bidirectional sync
    console.log('\n[3/3] Starting bidirectional sync...');
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
    await scraper.close();
    db.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = main;
