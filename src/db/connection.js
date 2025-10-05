const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

/**
 * Database connection and initialization
 */
class DatabaseConnection {
  constructor(dbPath = './db/gmaps.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  /**
   * Initialize database connection and create tables if needed
   */
  init() {
    // Ensure db directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL'); // Better concurrent access

    // Load and execute schema
    const schemaPath = path.join(__dirname, '../../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    this.db.exec(schema);

    console.log('Database initialized successfully');
    return this.db;
  }

  /**
   * Get the database connection
   */
  getConnection() {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = DatabaseConnection;
