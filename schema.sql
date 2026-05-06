PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS claim_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  pricer_only INTEGER NOT NULL DEFAULT 0 CHECK (pricer_only IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS component_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE CHECK (name IN ('Editor', 'Grouper', 'Pricer')),
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS claim_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_type_id INTEGER NOT NULL REFERENCES claim_types(id) ON DELETE CASCADE,
  component_type_id INTEGER NOT NULL REFERENCES component_types(id) ON DELETE RESTRICT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_update_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (claim_type_id, component_type_id)
);

CREATE TABLE IF NOT EXISTS releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_component_id INTEGER NOT NULL REFERENCES claim_components(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Planned' CHECK (status IN ('Planned', 'Announced', 'In Dev', 'Dev Complete', 'In PPMO', 'PPMO Complete', 'In PROD', 'Complete')),
  announce_date TEXT,
  dev_deploy_date TEXT,
  dev_complete_date TEXT,
  ppmo_deploy_date TEXT,
  ppmo_complete_date TEXT,
  prod_deploy_date TEXT,
  prod_complete_date TEXT,
  release_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (claim_component_id, version)
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL,
  description TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_releases_component ON releases(claim_component_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_releases_component_announce_date
  ON releases(claim_component_id, announce_date)
  WHERE announce_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_releases_status ON releases(status);
CREATE INDEX IF NOT EXISTS idx_attachments_release ON attachments(release_id);

CREATE TRIGGER IF NOT EXISTS trg_releases_updated_at
AFTER UPDATE ON releases
FOR EACH ROW
BEGIN
  UPDATE releases SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_components_last_update_insert
AFTER INSERT ON releases
FOR EACH ROW
BEGIN
  UPDATE claim_components SET last_update_date = datetime('now') WHERE id = NEW.claim_component_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_components_last_update_update
AFTER UPDATE ON releases
FOR EACH ROW
BEGIN
  UPDATE claim_components SET last_update_date = datetime('now') WHERE id = NEW.claim_component_id;
END;

INSERT OR IGNORE INTO component_types (id, name, display_order) VALUES
  (1, 'Editor', 1),
  (2, 'Grouper', 2),
  (3, 'Pricer', 3);

INSERT OR IGNORE INTO claim_types (id, name, description, pricer_only, display_order) VALUES
  (1, 'Claim Type 1', 'Rename this claim type in the tracker.', 0, 1),
  (2, 'Claim Type 2', 'Rename this claim type in the tracker.', 0, 2),
  (3, 'Claim Type 3', 'Rename this claim type in the tracker.', 0, 3),
  (4, 'Claim Type 4', 'Rename this claim type in the tracker.', 0, 4),
  (5, 'Claim Type 5', 'Pricer-only claim type. Rename this in the tracker.', 1, 5),
  (6, 'Claim Type 6', 'Pricer-only claim type. Rename this in the tracker.', 1, 6),
  (7, 'Claim Type 7', 'Pricer-only claim type. Rename this in the tracker.', 1, 7);

INSERT OR IGNORE INTO claim_components (claim_type_id, component_type_id)
SELECT ct.id, comp.id
FROM claim_types ct
JOIN component_types comp
WHERE (ct.pricer_only = 0 OR comp.name = 'Pricer');

UPDATE claim_components
SET is_active = 0
WHERE component_type_id = (SELECT id FROM component_types WHERE name = 'Grouper')
  AND claim_type_id IN (
    SELECT id
    FROM claim_types
    WHERE lower(name) LIKE '%outpatient%' OR lower(name) LIKE '%esrd%'
  );
