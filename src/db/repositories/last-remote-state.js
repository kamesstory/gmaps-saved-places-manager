/**
 * Last Remote State repository - tracks the "base" state for three-way merge
 * Stores what the remote (Google Maps) looked like at last successful sync
 */
class LastRemoteStateRepository {
  constructor(db) {
    this.db = db;
  }

  /**
   * Save or update remote state for an entity
   */
  upsert(entityType, entityId, stateHash) {
    const stmt = this.db.prepare(`
      INSERT INTO last_remote_state (entity_type, entity_id, state_hash, synced_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(entity_type, entity_id) DO UPDATE SET
        state_hash = ?,
        synced_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(entityType, entityId, stateHash, stateHash);
  }

  /**
   * Get remote state for an entity
   */
  find(entityType, entityId) {
    const stmt = this.db.prepare(`
      SELECT * FROM last_remote_state
      WHERE entity_type = ? AND entity_id = ?
    `);
    return stmt.get(entityType, entityId);
  }

  /**
   * Get all remote states of a given type
   */
  findByType(entityType) {
    const stmt = this.db.prepare(`
      SELECT * FROM last_remote_state WHERE entity_type = ?
    `);
    return stmt.all(entityType);
  }

  /**
   * Save place notes state
   */
  savePlaceNotes(placeId, notesHash) {
    return this.upsert('place_notes', `place_${placeId}`, notesHash);
  }

  /**
   * Get place notes state
   */
  getPlaceNotes(placeId) {
    const result = this.find('place_notes', `place_${placeId}`);
    return result ? result.state_hash : null;
  }

  /**
   * Save place-list association state
   */
  savePlaceListAssociation(placeId, listId, exists = true) {
    const stateHash = exists ? 'exists' : 'not_exists';
    return this.upsert('place_list_association', `place_${placeId}_list_${listId}`, stateHash);
  }

  /**
   * Get place-list association state
   */
  getPlaceListAssociation(placeId, listId) {
    const result = this.find('place_list_association', `place_${placeId}_list_${listId}`);
    return result ? result.state_hash : null;
  }

  /**
   * Remove state tracking for an entity (when permanently deleted)
   */
  remove(entityType, entityId) {
    const stmt = this.db.prepare(`
      DELETE FROM last_remote_state WHERE entity_type = ? AND entity_id = ?
    `);
    return stmt.run(entityType, entityId);
  }

  /**
   * Get all tracked place-list associations
   */
  getAllPlaceListAssociations() {
    return this.findByType('place_list_association');
  }

  /**
   * Get all tracked place notes
   */
  getAllPlaceNotes() {
    return this.findByType('place_notes');
  }
}

module.exports = LastRemoteStateRepository;
