const crypto = require('crypto');

/**
 * Places repository - handles all place-related database operations
 */
class PlacesRepository {
  constructor(db) {
    this.db = db;
  }

  /**
   * Generate SHA-256 hash of notes for change detection
   */
  hashNotes(notes) {
    if (!notes) return null;
    return crypto.createHash('sha256').update(notes).digest('hex');
  }

  /**
   * Upsert a place (insert or update if exists)
   */
  upsert(place) {
    const notesHash = this.hashNotes(place.notes);

    const stmt = this.db.prepare(`
      INSERT INTO places (google_place_id, google_maps_url, name, notes, notes_hash, last_synced)
      VALUES (@google_place_id, @google_maps_url, @name, @notes, @notes_hash, @last_synced)
      ON CONFLICT(google_place_id) DO UPDATE SET
        google_maps_url = @google_maps_url,
        name = @name,
        notes = @notes,
        notes_hash = @notes_hash,
        last_synced = @last_synced,
        is_deleted = FALSE
    `);

    return stmt.run({ ...place, notes_hash: notesHash });
  }

  /**
   * Get place by database ID
   */
  findById(id) {
    const stmt = this.db.prepare('SELECT * FROM places WHERE id = ?');
    return stmt.get(id);
  }

  /**
   * Get place by Google Place ID
   */
  findByGoogleId(googlePlaceId) {
    const stmt = this.db.prepare('SELECT * FROM places WHERE google_place_id = ?');
    return stmt.get(googlePlaceId);
  }

  /**
   * Get all non-deleted places
   */
  findAll() {
    const stmt = this.db.prepare('SELECT * FROM places WHERE is_deleted = FALSE ORDER BY created_at DESC');
    return stmt.all();
  }

  /**
   * Get places without notes
   */
  findWithoutNotes() {
    const stmt = this.db.prepare('SELECT * FROM places WHERE (notes IS NULL OR notes = "") AND is_deleted = FALSE');
    return stmt.all();
  }

  /**
   * Update place notes
   */
  updateNotes(id, notes) {
    const notesHash = this.hashNotes(notes);
    const stmt = this.db.prepare('UPDATE places SET notes = ?, notes_hash = ? WHERE id = ?');
    return stmt.run(notes, notesHash, id);
  }

  /**
   * Mark place as deleted locally (soft delete)
   */
  markDeletedLocally(id) {
    const stmt = this.db.prepare('UPDATE places SET is_deleted = TRUE, deleted_locally = TRUE WHERE id = ?');
    return stmt.run(id);
  }

  /**
   * Mark place as deleted (from remote)
   */
  markDeleted(id) {
    const stmt = this.db.prepare('UPDATE places SET is_deleted = TRUE WHERE id = ?');
    return stmt.run(id);
  }

  /**
   * Get all deleted places that need to be pushed
   */
  findPendingLocalDeletes() {
    const stmt = this.db.prepare('SELECT * FROM places WHERE deleted_locally = TRUE');
    return stmt.all();
  }
}

module.exports = PlacesRepository;
