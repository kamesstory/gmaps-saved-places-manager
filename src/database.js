const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

class GMapsDatabase {
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
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    this.db.exec(schema);

    console.log('Database initialized successfully');
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }

  // ============ PLACES OPERATIONS ============

  /**
   * Upsert a place (insert or update if exists)
   */
  upsertPlace(place) {
    const stmt = this.db.prepare(`
      INSERT INTO places (google_place_id, google_maps_url, name, notes, last_modified, last_synced)
      VALUES (@google_place_id, @google_maps_url, @name, @notes, @last_modified, @last_synced)
      ON CONFLICT(google_place_id) DO UPDATE SET
        google_maps_url = @google_maps_url,
        name = @name,
        notes = @notes,
        last_modified = @last_modified,
        last_synced = @last_synced,
        is_deleted = FALSE
    `);

    return stmt.run(place);
  }

  /**
   * Get place by Google Place ID
   */
  getPlaceByGoogleId(googlePlaceId) {
    const stmt = this.db.prepare('SELECT * FROM places WHERE google_place_id = ?');
    return stmt.get(googlePlaceId);
  }

  /**
   * Get all places
   */
  getAllPlaces() {
    const stmt = this.db.prepare('SELECT * FROM places WHERE is_deleted = FALSE ORDER BY last_modified DESC');
    return stmt.all();
  }

  /**
   * Mark place as deleted (soft delete)
   */
  markPlaceDeleted(placeId) {
    const stmt = this.db.prepare('UPDATE places SET is_deleted = TRUE WHERE id = ?');
    return stmt.run(placeId);
  }

  // ============ LISTS OPERATIONS ============

  /**
   * Upsert a list
   */
  upsertList(listName) {
    const stmt = this.db.prepare(`
      INSERT INTO lists (name, last_synced)
      VALUES (?, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        last_synced = CURRENT_TIMESTAMP
    `);

    return stmt.run(listName);
  }

  /**
   * Get list by name
   */
  getListByName(name) {
    const stmt = this.db.prepare('SELECT * FROM lists WHERE name = ?');
    return stmt.get(name);
  }

  /**
   * Get all lists
   */
  getAllLists() {
    const stmt = this.db.prepare('SELECT * FROM lists ORDER BY name');
    return stmt.all();
  }

  // ============ PLACE-LIST ASSOCIATIONS ============

  /**
   * Add place to list
   */
  addPlaceToList(placeId, listId) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO place_lists (place_id, list_id)
      VALUES (?, ?)
    `);

    return stmt.run(placeId, listId);
  }

  /**
   * Remove place from list
   */
  removePlaceFromList(placeId, listId) {
    const stmt = this.db.prepare('DELETE FROM place_lists WHERE place_id = ? AND list_id = ?');
    return stmt.run(placeId, listId);
  }

  /**
   * Get all places in a list
   */
  getPlacesInList(listId) {
    const stmt = this.db.prepare(`
      SELECT p.* FROM places p
      JOIN place_lists pl ON p.id = pl.place_id
      WHERE pl.list_id = ? AND p.is_deleted = FALSE
      ORDER BY pl.added_at DESC
    `);

    return stmt.all(listId);
  }

  /**
   * Get all lists containing a place
   */
  getListsForPlace(placeId) {
    const stmt = this.db.prepare(`
      SELECT l.* FROM lists l
      JOIN place_lists pl ON l.id = pl.list_id
      WHERE pl.place_id = ?
    `);

    return stmt.all(placeId);
  }

  // ============ PENDING OPERATIONS ============

  /**
   * Add a pending operation
   */
  addPendingOperation(operationType, payload) {
    const stmt = this.db.prepare(`
      INSERT INTO pending_operations (operation_type, payload)
      VALUES (?, ?)
    `);

    return stmt.run(operationType, JSON.stringify(payload));
  }

  /**
   * Get all pending operations
   */
  getPendingOperations() {
    const stmt = this.db.prepare(`
      SELECT * FROM pending_operations
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `);

    const ops = stmt.all();
    return ops.map(op => ({
      ...op,
      payload: JSON.parse(op.payload)
    }));
  }

  /**
   * Update operation status
   */
  updateOperationStatus(operationId, status, errorMessage = null) {
    const stmt = this.db.prepare(`
      UPDATE pending_operations
      SET status = ?,
          error_message = ?,
          completed_at = CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE id = ?
    `);

    return stmt.run(status, errorMessage, status, operationId);
  }

  // ============ SYNC LOG ============

  /**
   * Start a new sync
   */
  startSync(syncType) {
    const stmt = this.db.prepare(`
      INSERT INTO sync_log (sync_type, status)
      VALUES (?, 'in_progress')
    `);

    const result = stmt.run(syncType);
    return result.lastInsertRowid;
  }

  /**
   * Complete a sync
   */
  completeSync(syncId, placesSynced, listsSynced, errors = null, status = 'success') {
    const stmt = this.db.prepare(`
      UPDATE sync_log
      SET completed_at = CURRENT_TIMESTAMP,
          places_synced = ?,
          lists_synced = ?,
          errors = ?,
          status = ?
      WHERE id = ?
    `);

    return stmt.run(placesSynced, listsSynced, JSON.stringify(errors), status, syncId);
  }

  /**
   * Get recent sync logs
   */
  getRecentSyncs(limit = 10) {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_log
      ORDER BY started_at DESC
      LIMIT ?
    `);

    const syncs = stmt.all(limit);
    return syncs.map(sync => ({
      ...sync,
      errors: sync.errors ? JSON.parse(sync.errors) : null
    }));
  }
}

module.exports = GMapsDatabase;
