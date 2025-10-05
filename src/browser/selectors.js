/**
 * Centralized CSS selectors for Google Maps
 * Uses stable attributes (jsaction, aria-label, etc.) instead of fragile class names
 */

module.exports = {
  // Navigation
  SAVED_BUTTON: 'button[jsaction*="navigationrail.saved"]',

  // Lists
  LIST_BUTTON: 'button[jsaction*="pane.wfvdle"]',
  LIST_NAME: 'div[class*="fontBodyLarge"]',
  LIST_BUTTON_ALT: 'button.CsEnBe', // Fallback class-based selector

  // Places
  PLACE_BUTTON: 'button[jsaction*="pane.wfvdle"][jslog*="metadata"]',
  PLACE_NAME: 'div[class*="fontHeadlineSmall"]',
  PLACE_NAME_ALT: 'h1, h2, h3, h4, h5, h6, div[class*="headline"]',

  // Notes
  NOTES_TEXTAREA: 'textarea[aria-label="Note"]',
  NOTES_TEXTAREA_ALT: 'textarea[maxlength="4000"]',
  NOTES_TEXTAREA_FALLBACK: 'textarea',

  // Containers
  SCROLLABLE_FEED: '[role="feed"]',

  // Sign-in detection
  SIGN_IN_LINK: 'a[href*="ServiceLogin"]',
};
