/**
 * Central configuration for Google Maps sync
 */

module.exports = {
  // System lists that Google manages (can't be synced)
  SYSTEM_LISTS: ['Starred places', 'Saved places'],

  // CSV filename to Google Maps list name mappings
  CSV_NAME_MAPPINGS: {
    'Favorite places': 'Favorites',
    'Default list': 'Travel plans',
    'Jason_s Vienna Research': "Jason's Vienna Research"
  },

  // Timeouts (milliseconds)
  TIMEOUTS: {
    LISTS_LOAD: 3000,
    PLACES_LOAD: 3000,
    BACK_NAVIGATION: 2000,
    MAPS_PAGE_LOAD: 5000,
    SAVED_BUTTON_WAIT: 10000,
    SCREENSHOT_WAIT: 180000 // 3 minutes for manual inspection
  },

  // Delays between operations (milliseconds)
  DELAYS: {
    BETWEEN_LISTS_MIN: 1000,
    BETWEEN_LISTS_MAX: 2000,
    BETWEEN_LISTS_FULL_MIN: 2000,
    BETWEEN_LISTS_FULL_MAX: 4000,
    SCROLL_MIN: 1500,
    SCROLL_MAX: 2500
  },

  // Scrolling configuration
  SCROLL: {
    MAX_ATTEMPTS: 50,
    ITEMS_PER_SCROLL: 10 // Estimate for calculating scroll attempts
  },

  // Sync configuration
  SYNC: {
    QUICK_LIMIT: 50, // Places to scrape per list in quick sync
    RETRY_MAX: 3
  }
};
