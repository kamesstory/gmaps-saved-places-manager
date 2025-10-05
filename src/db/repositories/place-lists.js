/**
 * Place-Lists repository - handles place-list associations
 */
class PlaceListsRepository {
  constructor(db) {
    this.db = db;
  }

  /**
   * Add place to list
   */
  add(placeId, listId) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO place_lists (place_id, list_id)
      VALUES (?, ?)
    `);
    return stmt.run(placeId, listId);
  }

  /**
   * Remove place from list (hard delete)
   */
  remove(placeId, listId) {
    const stmt = this.db.prepare('DELETE FROM place_lists WHERE place_id = ? AND list_id = ?');
    return stmt.run(placeId, listId);
  }

  /**
   * Mark place-list association as deleted locally (soft delete for sync)
   */
  markDeletedLocally(placeId, listId) {
    const stmt = this.db.prepare('UPDATE place_lists SET deleted_locally = TRUE WHERE place_id = ? AND list_id = ?');
    return stmt.run(placeId, listId);
  }

  /**
   * Get all places in a list
   */
  findPlacesInList(listId, limit = null) {
    let query = `
      SELECT p.* FROM places p
      JOIN place_lists pl ON p.id = pl.place_id
      WHERE pl.list_id = ?
        AND p.is_deleted = FALSE
        AND pl.deleted_locally = FALSE
      ORDER BY pl.added_at DESC
    `;

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const stmt = this.db.prepare(query);
    return stmt.all(listId);
  }

  /**
   * Get all lists containing a place
   */
  findListsForPlace(placeId) {
    const stmt = this.db.prepare(`
      SELECT l.* FROM lists l
      JOIN place_lists pl ON l.id = pl.list_id
      WHERE pl.place_id = ?
        AND pl.deleted_locally = FALSE
    `);
    return stmt.all(placeId);
  }

  /**
   * Check if place is in list
   */
  exists(placeId, listId) {
    const stmt = this.db.prepare(`
      SELECT 1 FROM place_lists
      WHERE place_id = ? AND list_id = ? AND deleted_locally = FALSE
    `);
    return !!stmt.get(placeId, listId);
  }

  /**
   * Get all associations pending local deletion (need to push to remote)
   */
  findPendingLocalDeletes() {
    const stmt = this.db.prepare(`
      SELECT * FROM place_lists WHERE deleted_locally = TRUE
    `);
    return stmt.all();
  }

  /**
   * Get all associations for sync
   */
  findAll() {
    const stmt = this.db.prepare(`
      SELECT * FROM place_lists WHERE deleted_locally = FALSE
    `);
    return stmt.all();
  }
}

module.exports = PlaceListsRepository;
