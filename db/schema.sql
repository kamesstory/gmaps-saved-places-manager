-- Google Maps Saved Places Manager - Bidirectional Sync Schema
-- Three-way merge pattern: track base, local, and remote state

-- ============================================================================
-- CORE ENTITIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_place_id TEXT UNIQUE NOT NULL,
  google_maps_url TEXT,
  name TEXT NOT NULL,
  notes TEXT,
  notes_hash TEXT, -- SHA-256 hash for quick change detection

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_synced TIMESTAMP,

  -- State
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_locally BOOLEAN DEFAULT FALSE -- User deleted locally, needs push
);

CREATE INDEX IF NOT EXISTS idx_places_google_id ON places(google_place_id);
CREATE INDEX IF NOT EXISTS idx_places_notes_hash ON places(notes_hash);
CREATE INDEX IF NOT EXISTS idx_places_is_deleted ON places(is_deleted);

CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_list_id TEXT UNIQUE, -- From jslog metadata or generated
  name TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_synced TIMESTAMP,

  -- State
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_locally BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_lists_google_id ON lists(google_list_id);
CREATE INDEX IF NOT EXISTS idx_lists_name ON lists(name);

CREATE TABLE IF NOT EXISTS place_lists (
  place_id INTEGER NOT NULL,
  list_id INTEGER NOT NULL,

  -- Timestamps
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- State
  deleted_locally BOOLEAN DEFAULT FALSE, -- User removed locally, needs push

  PRIMARY KEY (place_id, list_id),
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_place_lists_place ON place_lists(place_id);
CREATE INDEX IF NOT EXISTS idx_place_lists_list ON place_lists(list_id);
CREATE INDEX IF NOT EXISTS idx_place_lists_deleted ON place_lists(deleted_locally);

-- ============================================================================
-- THREE-WAY MERGE: BASE STATE TRACKING
-- ============================================================================

-- Stores the "base" state - what remote looked like at last successful sync
-- This enables three-way merge: diff(base, local) and diff(base, remote)
CREATE TABLE IF NOT EXISTS last_remote_state (
  entity_type TEXT NOT NULL, -- 'place_notes' or 'place_list_association'
  entity_id TEXT NOT NULL,   -- 'place_123' or 'place_123_list_5'
  state_hash TEXT NOT NULL,  -- hash of notes or 'exists'/'not_exists' for associations
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_last_remote_state_type ON last_remote_state(entity_type);
CREATE INDEX IF NOT EXISTS idx_last_remote_state_synced ON last_remote_state(synced_at);

-- ============================================================================
-- WRITE OPERATIONS QUEUE
-- ============================================================================

CREATE TABLE IF NOT EXISTS pending_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Operation details
  operation_type TEXT NOT NULL, -- 'add_place_to_list', 'remove_place_from_list',
                                 -- 'update_notes', 'create_list', 'delete_list'
  payload JSON NOT NULL,

  -- Execution tracking
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed'

  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,

  -- Error tracking
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_ops_status ON pending_operations(status);
CREATE INDEX IF NOT EXISTS idx_pending_ops_retry ON pending_operations(next_retry_at);

-- ============================================================================
-- SYNC LOGGING
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_type TEXT NOT NULL, -- 'quick', 'deep', 'full'

  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  places_pulled INTEGER DEFAULT 0,
  operations_pushed INTEGER DEFAULT 0,
  conflicts_detected INTEGER DEFAULT 0,

  errors JSON, -- Array of error messages
  status TEXT  -- 'in_progress', 'success', 'partial', 'failed'
);

CREATE INDEX IF NOT EXISTS idx_sync_log_started ON sync_log(started_at);
CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status);
