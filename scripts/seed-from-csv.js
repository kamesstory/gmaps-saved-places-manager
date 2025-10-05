#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Database = require('../src/db');

/**
 * Parse CSV content into array of objects
 * Format: Title,Note,URL,Tags,Comment
 */
function parseCSV(content) {
  const lines = content.split('\n');
  const header = lines[0].split(',').map(h => h.trim());

  const places = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    // Simple CSV parsing (handles basic cases)
    const values = [];
    let currentValue = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim()); // Push last value

    // Create place object
    const place = {};
    header.forEach((key, index) => {
      place[key] = values[index] || '';
    });

    // Only add if we have at least a title and URL
    if (place.Title && place.URL) {
      places.push(place);
    }
  }

  return places;
}

/**
 * Extract Google Place ID from URL
 * Example: https://www.google.com/maps/place/.../@lat,lng,zoom/data=!3m1!4b1!4m6!3m5!1s0x89c25a31...
 */
function extractPlaceIdFromURL(url) {
  // Try to extract the place ID from various URL formats
  const patterns = [
    /\/place\/[^\/]+\/[^\/]+\/data=.*1s([^!]+)/,  // Standard format
    /cid=(\d+)/,  // CID format
    /ftid=([^&]+)/,  // FTID format
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  // Fallback: use the URL itself as a unique identifier
  return url;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Google Maps CSV Seed Script');
  console.log('='.repeat(60));

  const seedDir = path.join(__dirname, '../seed');
  const db = new Database();

  try {
    // Initialize database
    console.log('\n[1/4] Initializing database...');
    db.init();
    console.log('✅ Database initialized');

    // Find all CSV files in seed directory
    console.log('\n[2/4] Finding CSV files...');
    const files = fs.readdirSync(seedDir).filter(f => f.endsWith('.csv'));
    console.log(`✅ Found ${files.length} CSV files`);

    // Process each CSV file
    console.log('\n[3/4] Processing CSV files...');
    console.log('-'.repeat(60));

    let totalPlaces = 0;
    let totalDuplicates = 0;
    const stats = [];

    for (const file of files) {
      const listName = path.basename(file, '.csv');
      console.log(`\nProcessing: ${listName}`);

      // Read and parse CSV
      const filePath = path.join(seedDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const places = parseCSV(content);

      console.log(`  Found ${places.length} places in CSV`);

      // Create/get list
      db.lists.upsert(listName);
      const list = db.lists.findByName(listName);

      // Import places
      let imported = 0;
      let duplicates = 0;

      for (const place of places) {
        try {
          const googlePlaceId = extractPlaceIdFromURL(place.URL);

          // Check if place already exists
          const existing = db.places.findByGoogleId(googlePlaceId);

          const placeData = {
            google_place_id: googlePlaceId,
            google_maps_url: place.URL,
            name: place.Title,
            notes: place.Note || null,
            last_synced: new Date().toISOString()
          };

          db.places.upsert(placeData);
          const dbPlace = db.places.findByGoogleId(googlePlaceId);

          // Associate with list (handles duplicates automatically)
          db.placeLists.add(dbPlace.id, list.id);

          if (existing) {
            duplicates++;
          } else {
            imported++;
          }
        } catch (error) {
          console.error(`    ⚠️  Error importing "${place.Title}": ${error.message}`);
        }
      }

      console.log(`  ✅ Imported ${imported} new places, ${duplicates} already existed`);

      totalPlaces += imported;
      totalDuplicates += duplicates;
      stats.push({ listName, imported, duplicates, total: places.length });
    }

    // Summary
    console.log('\n[4/4] Summary');
    console.log('='.repeat(60));
    console.log(`\nProcessed ${files.length} lists:`);
    stats.forEach(s => {
      console.log(`  ${s.listName}: ${s.imported} new + ${s.duplicates} existing = ${s.total} total`);
    });

    console.log(`\n📊 Overall Statistics:`);
    console.log(`  Total unique places: ${totalPlaces}`);
    console.log(`  Total duplicate references: ${totalDuplicates}`);
    console.log(`  Total place-list associations: ${totalPlaces + totalDuplicates}`);

    // Verify database
    const allPlaces = db.places.findAll();
    const allLists = db.lists.findAll();

    console.log(`\n✅ Database verification:`);
    console.log(`  Places in database: ${allPlaces.length}`);
    console.log(`  Lists in database: ${allLists.length}`);

    console.log('\n' + '='.repeat(60));
    console.log('SEED COMPLETE');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Verify data: sqlite3 db/gmaps.db "SELECT * FROM places LIMIT 5;"');
    console.log('2. Check lists: sqlite3 db/gmaps.db "SELECT * FROM lists;"');
    console.log('3. Run sync to update with latest changes: npm run sync');

  } catch (error) {
    console.error('\n❌ Seed failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = main;
