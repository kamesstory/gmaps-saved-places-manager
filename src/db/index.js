const DatabaseConnection = require('./connection');
const PlacesRepository = require('./repositories/places');
const ListsRepository = require('./repositories/lists');
const PlaceListsRepository = require('./repositories/place-lists');
const LastRemoteStateRepository = require('./repositories/last-remote-state');

/**
 * Main database class - provides access to all repositories
 */
class Database {
  constructor(dbPath = './db/gmaps.db') {
    this.connection = new DatabaseConnection(dbPath);
    this.db = null;

    // Repositories
    this.places = null;
    this.lists = null;
    this.placeLists = null;
    this.lastRemoteState = null;
  }

  /**
   * Initialize database and all repositories
   */
  init() {
    this.db = this.connection.init();

    // Initialize all repositories with the database connection
    this.places = new PlacesRepository(this.db);
    this.lists = new ListsRepository(this.db);
    this.placeLists = new PlaceListsRepository(this.db);
    this.lastRemoteState = new LastRemoteStateRepository(this.db);

    return this;
  }

  /**
   * Get raw database connection (for custom queries)
   */
  getConnection() {
    return this.db;
  }

  /**
   * Close database connection
   */
  close() {
    this.connection.close();
  }

  // ============ PENDING OPERATIONS (kept here for now) ============

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
   * Get all pending operations ready to execute
   */
  getPendingOperations() {
    const stmt = this.db.prepare(`
      SELECT * FROM pending_operations
      WHERE status = 'pending'
        AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
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

  /**
   * Mark operation as failed and schedule retry
   */
  retryOperation(operationId, errorMessage) {
    const stmt = this.db.prepare(`
      UPDATE pending_operations
      SET retry_count = retry_count + 1,
          error_message = ?,
          next_retry_at = datetime('now', '+' || (retry_count + 1) * 5 || ' minutes'),
          status = CASE
            WHEN retry_count + 1 >= max_retries THEN 'failed'
            ELSE 'pending'
          END
      WHERE id = ?
    `);
    return stmt.run(errorMessage, operationId);
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
  completeSync(syncId, stats) {
    const stmt = this.db.prepare(`
      UPDATE sync_log
      SET completed_at = CURRENT_TIMESTAMP,
          places_pulled = ?,
          operations_pushed = ?,
          conflicts_detected = ?,
          errors = ?,
          status = ?
      WHERE id = ?
    `);

    return stmt.run(
      stats.placesPulled || 0,
      stats.operationsPushed || 0,
      stats.conflictsDetected || 0,
      JSON.stringify(stats.errors || []),
      stats.status || 'success',
      syncId
    );
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

module.exports = Database;
