const crypto = require('crypto');

/**
 * Change Detector - Implements three-way merge logic
 * Compares base (last known remote state) vs local vs remote (current)
 */
class ChangeDetector {
  constructor(db) {
    this.db = db;
  }

  /**
   * Hash function for change detection
   */
  hash(value) {
    if (value === null || value === undefined) return null;
    return crypto.createHash('sha256').update(String(value)).digest('hex');
  }

  /**
   * Detect changes for a single place's notes
   * Returns: { type, placeId, localValue, remoteValue, baseValue, resolution }
   */
  detectPlaceNotesChange(placeId, localNotes, remoteNotes) {
    // Get base state (what it was last sync)
    const baseHash = this.db.lastRemoteState.getPlaceNotes(placeId);
    const localHash = this.hash(localNotes);
    const remoteHash = this.hash(remoteNotes);

    // No changes at all
    if (localHash === remoteHash && localHash === baseHash) {
      return null;
    }

    // Local changed, remote didn't
    if (localHash !== baseHash && remoteHash === baseHash) {
      return {
        type: 'local_change',
        entity: 'place_notes',
        placeId,
        localValue: localNotes,
        remoteValue: remoteNotes,
        baseValue: baseHash,
        resolution: 'keep_local'
      };
    }

    // Remote changed, local didn't
    if (remoteHash !== baseHash && localHash === baseHash) {
      return {
        type: 'remote_change',
        entity: 'place_notes',
        placeId,
        localValue: localNotes,
        remoteValue: remoteNotes,
        baseValue: baseHash,
        resolution: 'take_remote'
      };
    }

    // Both changed (CONFLICT)
    if (localHash !== baseHash && remoteHash !== baseHash && localHash !== remoteHash) {
      return {
        type: 'conflict',
        entity: 'place_notes',
        placeId,
        localValue: localNotes,
        remoteValue: remoteNotes,
        baseValue: baseHash,
        resolution: 'local_wins' // Default conflict resolution
      };
    }

    // Both changed to same value (no conflict)
    if (localHash === remoteHash && localHash !== baseHash) {
      return {
        type: 'synchronized',
        entity: 'place_notes',
        placeId,
        localValue: localNotes,
        remoteValue: remoteNotes,
        baseValue: baseHash,
        resolution: 'already_synced'
      };
    }

    return null;
  }

  /**
   * Detect changes for place-list association
   * Returns: { type, placeId, listId, existsLocal, existsRemote, existedInBase, resolution }
   */
  detectPlaceListChange(placeId, listId, existsLocal, existsRemote) {
    // Get base state
    const baseState = this.db.lastRemoteState.getPlaceListAssociation(placeId, listId);
    const existedInBase = baseState === 'exists';

    // No changes
    if (existsLocal === existsRemote && existsLocal === existedInBase) {
      return null;
    }

    // Added locally
    if (existsLocal && !existsRemote && !existedInBase) {
      return {
        type: 'local_add',
        entity: 'place_list',
        placeId,
        listId,
        existsLocal,
        existsRemote,
        existedInBase,
        resolution: 'push_add'
      };
    }

    // Removed locally
    if (!existsLocal && existsRemote && existedInBase) {
      return {
        type: 'local_remove',
        entity: 'place_list',
        placeId,
        listId,
        existsLocal,
        existsRemote,
        existedInBase,
        resolution: 'push_remove'
      };
    }

    // Added remotely
    if (existsRemote && !existsLocal && !existedInBase) {
      return {
        type: 'remote_add',
        entity: 'place_list',
        placeId,
        listId,
        existsLocal,
        existsRemote,
        existedInBase,
        resolution: 'add_locally'
      };
    }

    // Removed remotely
    if (!existsRemote && existsLocal && existedInBase) {
      return {
        type: 'remote_remove',
        entity: 'place_list',
        placeId,
        listId,
        existsLocal,
        existsRemote,
        existedInBase,
        resolution: 'remove_locally'
      };
    }

    // Conflict: local removed, remote modified (or vice versa)
    if (existsLocal && !existsRemote && existedInBase) {
      return {
        type: 'conflict',
        entity: 'place_list',
        placeId,
        listId,
        existsLocal,
        existsRemote,
        existedInBase,
        resolution: 'local_wins' // Keep local state (removed)
      };
    }

    if (!existsLocal && existsRemote && existedInBase) {
      return {
        type: 'conflict',
        entity: 'place_list',
        placeId,
        listId,
        existsLocal,
        existsRemote,
        existedInBase,
        resolution: 'local_wins' // Keep local state (removed)
      };
    }

    return null;
  }

  /**
   * Detect all changes between local and remote for a specific list
   * @param {string} listName - Name of the list to check
   * @param {Array} remotePlaces - Places scraped from Google Maps
   * @returns {Object} { notesChanges: [], associationChanges: [], conflicts: [] }
   */
  detectChangesForList(listName, remotePlaces) {
    const list = this.db.lists.findByName(listName);
    if (!list) {
      throw new Error(`List not found: ${listName}`);
    }

    const changes = {
      notesChanges: [],
      associationChanges: [],
      conflicts: []
    };

    // Get local places in this list
    const localPlaces = this.db.placeLists.findPlacesInList(list.id);

    // Build lookup maps
    const localPlaceMap = new Map();
    localPlaces.forEach(p => localPlaceMap.set(p.google_place_id, p));

    const remotePlaceMap = new Map();
    remotePlaces.forEach(p => remotePlaceMap.set(p.google_place_id, p));

    // Check all places that exist in either local or remote
    const allPlaceIds = new Set([
      ...localPlaceMap.keys(),
      ...remotePlaceMap.keys()
    ]);

    for (const googlePlaceId of allPlaceIds) {
      const localPlace = localPlaceMap.get(googlePlaceId);
      const remotePlace = remotePlaceMap.get(googlePlaceId);

      // Check notes changes (if place exists in both)
      if (localPlace && remotePlace) {
        const notesChange = this.detectPlaceNotesChange(
          localPlace.id,
          localPlace.notes,
          remotePlace.notes
        );

        if (notesChange) {
          changes.notesChanges.push(notesChange);
          if (notesChange.type === 'conflict') {
            changes.conflicts.push(notesChange);
          }
        }
      }

      // Check association changes
      const existsLocal = !!localPlace;
      const existsRemote = !!remotePlace;

      // For association detection, we need the place ID from database
      let placeId;
      if (localPlace) {
        placeId = localPlace.id;
      } else if (remotePlace) {
        // Place exists remotely but not locally - need to find or create it
        const existingPlace = this.db.places.findByGoogleId(googlePlaceId);
        placeId = existingPlace ? existingPlace.id : null;
      }

      if (placeId) {
        const assocChange = this.detectPlaceListChange(
          placeId,
          list.id,
          existsLocal,
          existsRemote
        );

        if (assocChange) {
          changes.associationChanges.push(assocChange);
          if (assocChange.type === 'conflict') {
            changes.conflicts.push(assocChange);
          }
        }
      }
    }

    return changes;
  }

  /**
   * Detect all changes across all lists (full sync)
   * @param {Object} remoteState - { listName: [places] }
   * @returns {Object} { notesChanges: [], associationChanges: [], conflicts: [] }
   */
  detectAllChanges(remoteState) {
    const allChanges = {
      notesChanges: [],
      associationChanges: [],
      conflicts: []
    };

    for (const [listName, remotePlaces] of Object.entries(remoteState)) {
      const listChanges = this.detectChangesForList(listName, remotePlaces);

      allChanges.notesChanges.push(...listChanges.notesChanges);
      allChanges.associationChanges.push(...listChanges.associationChanges);
      allChanges.conflicts.push(...listChanges.conflicts);
    }

    return allChanges;
  }
}

module.exports = ChangeDetector;
