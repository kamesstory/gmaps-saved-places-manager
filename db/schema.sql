-- Google Maps Saved Places Manager Database Schema

CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_place_id TEXT UNIQUE NOT NULL,
  google_maps_url TEXT,
  name TEXT NOT NULL,
  notes TEXT,
  last_modified TIMESTAMP,
  last_synced TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_places_google_id ON places(google_place_id);
CREATE INDEX idx_places_last_synced ON places(last_synced);
CREATE INDEX idx_places_is_deleted ON places(is_deleted);

CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  last_synced TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lists_name ON lists(name);

CREATE TABLE IF NOT EXISTS place_lists (
  place_id INTEGER NOT NULL,
  list_id INTEGER NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (place_id, list_id),
  FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE INDEX idx_place_lists_place ON place_lists(place_id);
CREATE INDEX idx_place_lists_list ON place_lists(list_id);

CREATE TABLE IF NOT EXISTS pending_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_type TEXT NOT NULL,  -- 'move', 'delete', 'add', 'create_list', 'update_notes'
  payload JSON NOT NULL,
  status TEXT DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed', 'failed'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_pending_ops_status ON pending_operations(status);
CREATE INDEX idx_pending_ops_created ON pending_operations(created_at);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_type TEXT NOT NULL,  -- 'full', 'incremental'
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  places_synced INTEGER DEFAULT 0,
  lists_synced INTEGER DEFAULT 0,
  errors JSON,  -- Array of error objects
  status TEXT  -- 'success', 'partial', 'failed'
);

CREATE INDEX idx_sync_log_started ON sync_log(started_at);
CREATE INDEX idx_sync_log_status ON sync_log(status);
