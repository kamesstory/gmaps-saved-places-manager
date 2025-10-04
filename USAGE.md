# Usage Guide

## Step 1: Find the Correct Selectors

Before running sync, you need to find the correct DOM selectors for Google Maps.

### Run the inspector:
```bash
npm run inspect
```

This will:
1. Open Google Maps in a browser
2. Give you an interactive shell to explore the DOM

### Commands in the inspector:

**`lists`** - Tries multiple strategies to find list names
- Analyzes the page structure
- Shows you potential selectors for lists
- Returns class names, IDs, and sample text

**`places`** - Tries multiple strategies to find place items
- Looks for place links, names, notes
- Shows parent containers
- Identifies data attributes

**`eval <code>`** - Run custom JavaScript on the page
```javascript
// Example: Count all links
eval document.querySelectorAll('a').length

// Example: Find elements by class
eval document.querySelector('.some-class')?.textContent
```

**`click <selector>`** - Click an element
```bash
click button[aria-label="Want to go"]
```

**`screenshot`** - Save a screenshot for reference

**`html`** - Dump entire page HTML

### What to look for:

1. **For Lists:**
   - Look for navigation buttons or menu items
   - Common patterns: `button[aria-label="Want to go"]`, navigation roles
   - Note the selector and text content

2. **For Places:**
   - Look for items with `data-place-id` or similar
   - Check for links containing `/maps/place/`
   - Find parent containers that wrap each place
   - Locate where notes/descriptions are stored

## Step 2: Update Selectors

After finding the correct selectors, update `src/scraper.js`:

### Lists (line ~25-35):
```javascript
// Replace this placeholder:
const lists = await this.page.$$eval('[role="list"] [role="listitem"]', ...);

// With actual selector, e.g.:
const lists = await this.page.$$eval('button[aria-label*="list"]', ...);
```

### Places (line ~70-100):
```javascript
// Update these placeholders:
const newPlaces = await this.page.$$eval('[data-place-id]', (items) => {
  // Update the selectors inside this function
  const nameElement = item.querySelector('h3'); // ← Update this
  const linkElement = item.querySelector('a[href*="maps"]'); // ← Update this
  const notesElement = item.querySelector('[class*="note"]'); // ← Update this
  ...
});
```

## Step 3: Test Sync

### Small test first:
```bash
npm run sync
```

This runs an incremental sync (top ~50 places per list).

Check the output:
- Does it find your lists?
- Does it extract place data correctly?
- Any errors?

### Check the database:
```bash
sqlite3 db/gmaps.db "SELECT COUNT(*) FROM places;"
sqlite3 db/gmaps.db "SELECT name, notes FROM places LIMIT 5;"
```

### Full sync when ready:
```bash
npm run sync:full
```

## Troubleshooting

### "Could not find list names"
- Run `npm run inspect`
- Use the `lists` command
- Update the selector in `scraper.js:getListNames()`

### "Places have null data"
- Run `npm run inspect`
- Use the `places` command
- Update selectors in `scraper.js:scrapePlacesFromCurrentList()`

### "Need to log in"
- Browser will pause for manual login
- Log in and wait for the page to load
- Session will be saved for future runs

### Selectors stopped working
- Google changed their UI
- Run inspector again to find new selectors
- Update `scraper.js`

## Example Workflow

```bash
# 1. Inspect the page
npm run inspect
> lists
> places
> screenshot
> quit

# 2. Update scraper.js with correct selectors

# 3. Test with small sync
npm run sync

# 4. Check results
sqlite3 db/gmaps.db "SELECT * FROM places LIMIT 5;"

# 5. Full sync when confident
npm run sync:full
```

## Next: Implementing Features

Once sync works, you can build on top of the database:

1. **Cleanup script**: Remove places without notes
2. **Clustering script**: Organize by city/region
3. **Write operations**: Create lists, move places
4. **Webhook integration**: SMS/email → Maps updates
