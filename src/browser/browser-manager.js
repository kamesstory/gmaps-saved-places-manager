const { chromium } = require('playwright');
const path = require('path');
const os = require('os');
const config = require('../config');
const selectors = require('./selectors');

class BrowserManager {
  constructor(userDataDir = null, useRealProfile = false) {
    if (useRealProfile) {
      // Use real Chrome profile to avoid bot detection
      const homeDir = os.homedir();
      if (process.platform === 'darwin') {
        this.userDataDir = path.join(homeDir, 'Library/Application Support/Google/Chrome');
      } else if (process.platform === 'win32') {
        this.userDataDir = path.join(homeDir, 'AppData/Local/Google/Chrome/User Data');
      } else {
        this.userDataDir = path.join(homeDir, '.config/google-chrome');
      }
    } else {
      this.userDataDir = path.resolve(userDataDir || './browser-data');
    }
    this.context = null;
    this.page = null;
  }

  /**
   * Launch browser with persistent context
   * On first run, user will need to manually log in to Google Maps
   */
  async launch(headless = false) {
    console.log('Launching browser...');
    console.log(`Using profile: ${this.userDataDir}`);

    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless,
      channel: 'chrome', // Use installed Chrome if available
      viewport: { width: 1400, height: 900 },
      args: [
        '--disable-blink-features=AutomationControlled', // Hide automation
      ],
      timeout: 180000 // 3 minutes timeout
    });

    // Use existing page if available
    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

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

    // First navigate to Google Maps main page
    console.log('Navigating to Google Maps...');
    await this.page.goto('https://google.com/maps', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for page to load
    console.log('Waiting for Maps to load...');
    await this.page.waitForTimeout(config.TIMEOUTS.MAPS_PAGE_LOAD);

    // Now click the "Saved" button
    console.log('Clicking "Saved" button...');

    try {
      // Wait for the Saved button to appear
      await this.page.waitForSelector(selectors.SAVED_BUTTON, { timeout: config.TIMEOUTS.SAVED_BUTTON_WAIT });

      // Find the Saved button
      const savedButton = await this.page.$(selectors.SAVED_BUTTON);

      if (savedButton) {
        await savedButton.click();
        console.log('✅ Clicked Saved button');
        await this.page.waitForTimeout(config.TIMEOUTS.MAPS_PAGE_LOAD);
      } else {
        throw new Error('Could not find Saved button');
      }
    } catch (error) {
      console.log('\n⚠️  Could not automatically click Saved button');
      console.log('Please manually click "Saved" in the browser sidebar.');
      console.log('Waiting 20 seconds...\n');
      await this.page.waitForTimeout(20000);
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

    const screenshotPath = path.join(__dirname, '../../screenshots', `${name}-${Date.now()}.png`);
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
