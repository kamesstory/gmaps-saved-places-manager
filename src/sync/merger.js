/**
 * Merger - Applies changes detected by ChangeDetector
 * Handles conflicts using configurable resolution strategies
 */
class Merger {
  constructor(db) {
    this.db = db;
    this.conflictStrategy = 'local_wins'; // default strategy
  }

  /**
   * Set conflict resolution strategy
   */
  setConflictStrategy(strategy) {
    this.conflictStrategy = strategy;
  }

  /**
   * Apply a notes change to the database
   */
  applyNotesChange(change) {
    const place = this.db.places.findById(change.placeId);
    if (!place) {
      console.warn(`Place ${change.placeId} not found, skipping notes change`);
      return;
    }

    switch (change.resolution) {
      case 'keep_local':
        // Local already has the right value, just update base state
        this.db.lastRemoteState.savePlaceNotes(change.placeId, this.db.places.hashNotes(change.localValue));
        console.log(`  ✓ Kept local notes for place ${place.name}`);
        break;

      case 'take_remote':
        // Update local with remote value
        this.db.places.updateNotes(change.placeId, change.remoteValue);
        this.db.lastRemoteState.savePlaceNotes(change.placeId, this.db.places.hashNotes(change.remoteValue));
        console.log(`  ✓ Updated notes from remote for place ${place.name}`);
        break;

      case 'local_wins':
        // Conflict: local wins, but log it
        this.db.lastRemoteState.savePlaceNotes(change.placeId, this.db.places.hashNotes(change.localValue));
        console.log(`  ⚠️  CONFLICT: Kept local notes for place ${place.name}`);
        console.log(`     Local: "${change.localValue}"`);
        console.log(`     Remote: "${change.remoteValue}"`);
        break;

      case 'already_synced':
        // Both changed to same value, just update base
        this.db.lastRemoteState.savePlaceNotes(change.placeId, this.db.places.hashNotes(change.localValue));
        console.log(`  ✓ Already synchronized: ${place.name}`);
        break;

      default:
        console.warn(`Unknown resolution strategy: ${change.resolution}`);
    }
  }

  /**
   * Apply an association change to the database
   */
  applyAssociationChange(change) {
    switch (change.resolution) {
      case 'push_add':
        // Local added this - queue for push to remote
        console.log(`  → Queue add to remote: place ${change.placeId} to list ${change.listId}`);
        this.db.addPendingOperation('add_place_to_list', {
          placeId: change.placeId,
          listId: change.listId
        });
        // Update base state to reflect local state
        this.db.lastRemoteState.savePlaceListAssociation(change.placeId, change.listId, true);
        break;

      case 'push_remove':
        // Local removed this - queue for push to remote
        console.log(`  → Queue remove from remote: place ${change.placeId} from list ${change.listId}`);
        this.db.addPendingOperation('remove_place_from_list', {
          placeId: change.placeId,
          listId: change.listId
        });
        // Update base state to reflect local state
        this.db.lastRemoteState.savePlaceListAssociation(change.placeId, change.listId, false);
        break;

      case 'add_locally':
        // Remote added this - add to local
        this.db.placeLists.add(change.placeId, change.listId);
        this.db.lastRemoteState.savePlaceListAssociation(change.placeId, change.listId, true);
        console.log(`  ✓ Added association locally: place ${change.placeId} to list ${change.listId}`);
        break;

      case 'remove_locally':
        // Remote removed this - remove from local
        this.db.placeLists.remove(change.placeId, change.listId);
        this.db.lastRemoteState.savePlaceListAssociation(change.placeId, change.listId, false);
        console.log(`  ✓ Removed association locally: place ${change.placeId} from list ${change.listId}`);
        break;

      case 'local_wins':
        // Conflict: keep local state
        if (change.existsLocal) {
          // Local wants to keep it, remote removed it - queue re-add
          console.log(`  ⚠️  CONFLICT: Keeping local association (place ${change.placeId} in list ${change.listId})`);
          this.db.addPendingOperation('add_place_to_list', {
            placeId: change.placeId,
            listId: change.listId
          });
          this.db.lastRemoteState.savePlaceListAssociation(change.placeId, change.listId, true);
        } else {
          // Local wants to remove it, remote kept it - queue removal
          console.log(`  ⚠️  CONFLICT: Keeping local removal (place ${change.placeId} from list ${change.listId})`);
          this.db.addPendingOperation('remove_place_from_list', {
            placeId: change.placeId,
            listId: change.listId
          });
          this.db.lastRemoteState.savePlaceListAssociation(change.placeId, change.listId, false);
        }
        break;

      default:
        console.warn(`Unknown resolution strategy: ${change.resolution}`);
    }
  }

  /**
   * Apply all changes detected by ChangeDetector
   * @param {Object} changes - { notesChanges, associationChanges, conflicts }
   * @returns {Object} { applied: number, conflicts: number }
   */
  applyChanges(changes) {
    console.log('\n📝 Applying changes...');
    console.log(`  Notes changes: ${changes.notesChanges.length}`);
    console.log(`  Association changes: ${changes.associationChanges.length}`);
    console.log(`  Conflicts: ${changes.conflicts.length}`);

    let applied = 0;
    let conflicts = 0;

    // Apply notes changes
    for (const change of changes.notesChanges) {
      try {
        this.applyNotesChange(change);
        applied++;
        if (change.type === 'conflict') {
          conflicts++;
        }
      } catch (error) {
        console.error(`  ❌ Error applying notes change:`, error.message);
      }
    }

    // Apply association changes
    for (const change of changes.associationChanges) {
      try {
        this.applyAssociationChange(change);
        applied++;
        if (change.type === 'conflict') {
          conflicts++;
        }
      } catch (error) {
        console.error(`  ❌ Error applying association change:`, error.message);
      }
    }

    console.log(`\n✅ Applied ${applied} changes (${conflicts} conflicts resolved)`);

    return { applied, conflicts };
  }
}

module.exports = Merger;
