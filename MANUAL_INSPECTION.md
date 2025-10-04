# Manual Inspection Guide

Since automated inspection is hitting Google's anti-bot measures, here's how to find the selectors manually:

## Step 1: Open Google Maps

1. Open Chrome normally
2. Go to: https://www.google.com/maps/saved
3. Make sure you're logged in and can see your lists

## Step 2: Open Developer Tools

Press `F12` or `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows)

## Step 3: Find List Selectors

### A. Find a list button (e.g., "Want to go")
1. Click the "Select element" tool (top-left of DevTools, looks like a cursor in a box)
2. Click on the "Want to go" list name in the page
3. In the Elements panel, you'll see the HTML highlighted

**What to record:**
- Tag name (button, div, a, etc.)
- Any `aria-label` attribute
- Class names (the `class="..."` value)
- Parent container structure

**Example output:**
```html
<button class="some-class another-class" aria-label="Want to go">
  <span>Want to go</span>
</button>
```

**Record:**
- Selector: `button[aria-label="Want to go"]`
- Or: `.some-class.another-class`

### B. Find all lists
In the Console tab (bottom of DevTools), run:

```javascript
// Find all buttons with list names
document.querySelectorAll('button[aria-label]').forEach(btn => {
  console.log(btn.getAttribute('aria-label'), btn.className);
});
```

## Step 4: Find Place Selectors

### A. Navigate into a list
1. Click on "Want to go" to see your places
2. Wait for places to load

### B. Inspect a place item
1. Use the element selector tool again
2. Click on a restaurant/place name
3. Look at the HTML structure

**What to record:**

**Place Container:**
- What element wraps each place? (div, article, li, etc.)
- Does it have a unique class?
- Does it have a `role="listitem"` attribute?
- Any data attributes? (`data-place-id`, `data-item-id`, etc.)

**Place Name:**
- Where is the name? (h2, h3, span, etc.)
- What class?

**Place Link:**
- Is there an `<a>` tag linking to the place?
- Does the href contain `/maps/place/` or coordinates?

**Place Notes:**
- Where are your personal notes stored?
- What element/class contains them?

**Example structure:**
```html
<div role="listitem" class="place-item-class">
  <a href="https://www.google.com/maps/place/Restaurant/@lat,lng">
    <h3 class="place-name">Restaurant Name</h3>
  </a>
  <div class="place-notes">My notes here</div>
</div>
```

### C. Run inspection script in Console

Paste this into the Console tab:

```javascript
// Find place containers
const places = document.querySelectorAll('[role="listitem"], .place, article');
console.log('Found', places.length, 'place containers');

// Analyze first 3 places
Array.from(places).slice(0, 3).forEach((place, i) => {
  console.log(`\n=== Place ${i+1} ===`);
  console.log('Container:', place.tagName, place.className);

  const name = place.querySelector('h1, h2, h3, h4, [class*="name"], [class*="title"]');
  console.log('Name element:', name?.tagName, name?.className, name?.textContent.slice(0, 50));

  const link = place.querySelector('a[href*="maps"]');
  console.log('Link:', link?.href);

  const note = place.querySelector('[class*="note"], [class*="comment"], [class*="description"]');
  console.log('Note element:', note?.tagName, note?.className, note?.textContent.slice(0, 50));

  // Check for data attributes
  const dataAttrs = Array.from(place.attributes).filter(attr => attr.name.startsWith('data-'));
  console.log('Data attributes:', dataAttrs.map(a => `${a.name}="${a.value}"`));
});
```

## Step 5: Test Selectors

Once you have candidate selectors, test them in Console:

```javascript
// Test list selector
document.querySelectorAll('YOUR_LIST_SELECTOR_HERE').length

// Test place selector
document.querySelectorAll('YOUR_PLACE_SELECTOR_HERE').length

// Example:
document.querySelectorAll('button[aria-label*="list"]').length
document.querySelectorAll('[role="listitem"]').length
```

## Step 6: Report Back

Share with me:

1. **List Selector:**
   - Example: `button[aria-label*="Want to go"]`
   - Or: `.Yz7gmc button`

2. **Place Container Selector:**
   - Example: `[role="listitem"]`
   - Or: `article.place-card`

3. **Within each place, how to find:**
   - Name: `h3.place-name`
   - Link: `a[href*="/maps/place/"]`
   - Notes: `div.place-notes`

4. **Any data attributes on places:**
   - Example: `data-place-id="ChIJ..."`

## Example Complete Report

```
Lists:
- Selector: button[aria-label]
- Each list is a button with aria-label containing the list name

Places:
- Container: [role="listitem"]
- Name: querySelector('h3')
- Link: querySelector('a[href*="maps"]')
- Notes: querySelector('div[class*="description"]')
- Has data-place-id: Yes

Example place structure:
<div role="listitem" data-place-id="123">
  <a href="/maps/place/...">
    <h3>Place Name</h3>
  </a>
  <div class="desc">My notes</div>
</div>
```

Once you have this info, I can update the scraper with the correct selectors!
