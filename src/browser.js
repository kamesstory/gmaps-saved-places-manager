const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

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

    console.log('Navigating to Google Maps saved places...');
    await this.page.goto('https://www.google.com/maps/saved', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for dynamic content to load
    console.log('Waiting for content to load...');
    await this.page.waitForTimeout(5000);

    // Check if we're actually logged in and on the right page
    const title = await this.page.title();
    const url = this.page.url();

    if (title.includes('Error') || title.includes('404') || url.includes('ServiceLogin')) {
      console.log('\n⚠️  NOT LOGGED IN or PAGE FAILED TO LOAD');
      console.log(`Current URL: ${url}`);
      console.log(`Page Title: ${title}`);
      console.log('\nPossible issues:');
      console.log('1. Google detected automation - Make sure Chrome is fully closed before running');
      console.log('2. Not logged in - Log in manually and try again');
      console.log('3. Network issue - Check your connection\n');
      throw new Error('Failed to access Google Maps saved places');
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
