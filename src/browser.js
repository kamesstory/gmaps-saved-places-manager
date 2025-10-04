const { chromium } = require('playwright');
const path = require('path');

class BrowserManager {
  constructor(userDataDir = './browser-data') {
    this.userDataDir = path.resolve(userDataDir);
    this.context = null;
    this.page = null;
  }

  /**
   * Launch browser with persistent context
   * On first run, user will need to manually log in to Google Maps
   */
  async launch(headless = false) {
    console.log('Launching browser...');

    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless,
      channel: 'chrome', // Use installed Chrome if available
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      args: [
        '--disable-blink-features=AutomationControlled', // Hide automation
      ]
    });

    // Create a new page
    this.page = await this.context.newPage();

    console.log('Browser launched successfully');
    return this.page;
  }

  /**
   * Navigate to Google Maps saved places
   */
  async navigateToSavedPlaces() {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    console.log('Navigating to Google Maps saved places...');
    await this.page.goto('https://www.google.com/maps/saved', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait a bit for dynamic content to load
    await this.page.waitForTimeout(2000);

    // Check if we need to log in
    const isLoggedIn = await this.checkIfLoggedIn();
    if (!isLoggedIn) {
      console.log('\n⚠️  You need to log in to Google Maps manually.');
      console.log('Please log in in the browser window and press Enter when done...');

      // Wait for user to log in manually
      // In a real implementation, you might want to use readline or similar
      await this.page.waitForTimeout(60000); // Give user 60 seconds
    }

    console.log('Successfully navigated to saved places');
  }

  /**
   * Check if user is logged in
   */
  async checkIfLoggedIn() {
    try {
      // Look for sign-in button or similar indicators
      const signInButton = await this.page.$('a[href*="ServiceLogin"]');
      return !signInButton;
    } catch (error) {
      return false;
    }
  }

  /**
   * Add random delay to mimic human behavior
   */
  async randomDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.page.waitForTimeout(delay);
  }

  /**
   * Take a screenshot for debugging
   */
  async screenshot(name = 'debug') {
    if (!this.page) return;

    const screenshotPath = path.join(__dirname, '../screenshots', `${name}-${Date.now()}.png`);
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved: ${screenshotPath}`);
  }

  /**
   * Close browser
   */
  async close() {
    if (this.context) {
      await this.context.close();
      console.log('Browser closed');
    }
  }
}

module.exports = BrowserManager;
