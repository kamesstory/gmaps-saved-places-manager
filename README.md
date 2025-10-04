# Google Maps Saved Places Manager

Automate management of your Google Maps saved places using browser automation and a local SQLite database.

## Features

- **Sync Google Maps saved places to local SQLite database**
- **Incremental syncing** (only fetch recently modified places)
- **Full audit trail** with sync logs and operation tracking
- **Persistent browser session** (log in once, stays logged in)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run your first sync:
```bash
node scripts/sync.js
```

On first run, a browser window will open. Log in to your Google account manually, then the script will continue automatically.

## Usage

### Sync (Incremental)
Fetches only the most recent ~50 places per list:
```bash
node scripts/sync.js
```

### Full Sync
Fetches all places from all lists:
```bash
node scripts/sync.js --full
```

## Project Structure

```
.
├── db/
│   ├── schema.sql          # Database schema
│   └── gmaps.db            # SQLite database (auto-created)
├── src/
│   ├── database.js         # Database operations
│   ├── browser.js          # Browser automation
│   └── scraper.js          # Google Maps scraping logic
├── scripts/
│   └── sync.js             # Main sync script
└── browser-data/           # Persistent browser session (auto-created)
```

## Database Schema

- **places**: Stores place data (name, notes, URL, etc.)
- **lists**: Your Google Maps lists (Want to go, Favorites, etc.)
- **place_lists**: Many-to-many relationship between places and lists
- **pending_operations**: Queue for write operations to Google Maps
- **sync_log**: History of sync operations for debugging

## Important Notes

⚠️ **This tool uses browser automation which may be fragile**:
- Google Maps UI changes will break selectors
- Selectors in `scraper.js` are **PLACEHOLDERS** and need to be updated after inspecting the actual Google Maps DOM
- Run the script, inspect the page, and update selectors accordingly

⚠️ **Authentication**:
- Your login session is stored in `browser-data/`
- Keep this directory secure (it's in .gitignore)
- Cookies may expire after weeks/months - just log in again

## Next Steps

1. **Update selectors**: Inspect Google Maps in the browser and update DOM selectors in `scraper.js`
2. **Add cleanup logic**: Implement the "remove places without notes" feature
3. **Add clustering**: Implement geographic clustering to organize by city
4. **Add write operations**: Implement moving places between lists, creating lists, etc.

## Development

The current implementation is a **foundation** that:
- ✅ Sets up database structure
- ✅ Handles browser automation with persistent auth
- ✅ Provides scraping framework
- ⚠️ Needs selectors updated for actual Google Maps DOM
- ⚠️ Needs write operations implemented

This is an MVP that you'll need to iterate on as you test against real Google Maps pages.
