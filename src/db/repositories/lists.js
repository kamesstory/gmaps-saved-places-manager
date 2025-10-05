/**
 * Lists repository - handles all list-related database operations
 */
class ListsRepository {
  constructor(db) {
    this.db = db;
  }

  /**
   * Upsert a list by Google list ID (or name as fallback)
   */
  upsert(googleListId, name) {
    // If only one argument provided, treat it as name (legacy support)
    if (arguments.length === 1) {
      name = googleListId;
      googleListId = null;
    }

    if (googleListId) {
      // Prefer google_list_id for matching
      const stmt = this.db.prepare(`
        INSERT INTO lists (google_list_id, name, last_synced)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(google_list_id) DO UPDATE SET
          name = ?,
          last_synced = CURRENT_TIMESTAMP
      `);
      return stmt.run(googleListId, name, name);
    } else {
      // Fallback: use name only (for CSV imports without google IDs)
      const existing = this.findByName(name);
      if (existing) {
        const updateStmt = this.db.prepare('UPDATE lists SET last_synced = CURRENT_TIMESTAMP WHERE id = ?');
        return updateStmt.run(existing.id);
      }

      const stmt = this.db.prepare(`
        INSERT INTO lists (name, last_synced)
        VALUES (?, CURRENT_TIMESTAMP)
      `);
      return stmt.run(name);
    }
  }

  /**
   * Get list by database ID
   */
  findById(id) {
    const stmt = this.db.prepare('SELECT * FROM lists WHERE id = ?');
    return stmt.get(id);
  }

  /**
   * Get list by Google list ID
   */
  findByGoogleId(googleListId) {
    const stmt = this.db.prepare('SELECT * FROM lists WHERE google_list_id = ?');
    return stmt.get(googleListId);
  }

  /**
   * Get list by name
   */
  findByName(name) {
    const stmt = this.db.prepare('SELECT * FROM lists WHERE name = ?');
    return stmt.get(name);
  }

  /**
   * Get all non-deleted lists
   */
  findAll() {
    const stmt = this.db.prepare('SELECT * FROM lists WHERE is_deleted = FALSE ORDER BY name');
    return stmt.all();
  }

  /**
   * Mark list as deleted locally
   */
  markDeletedLocally(id) {
    const stmt = this.db.prepare('UPDATE lists SET is_deleted = TRUE, deleted_locally = TRUE WHERE id = ?');
    return stmt.run(id);
  }
}

module.exports = ListsRepository;
