const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DB_PATH = path.join(ROOT, 'data', 'microdyn_tracker.sqlite');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);

function ensureDirs() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function openDb() {
  ensureDirs();
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

function initDb() {
  const db = openDb();
  const schema = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  db.exec(schema);
  migrateDb(db);
  db.close();
}

initDb();

if (process.argv.includes('--init-db')) {
  console.log(`Initialized SQLite database at ${DB_PATH}`);
  process.exit(0);
}

const db = openDb();
migrateDb(db);

function migrateDb(database) {
  const componentColumns = database.prepare('PRAGMA table_info(claim_components)').all().map(column => column.name);
  if (!componentColumns.includes('last_update_date')) {
    database.exec('ALTER TABLE claim_components ADD COLUMN last_update_date TEXT;');
  }
  database.exec(`
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

    CREATE UNIQUE INDEX IF NOT EXISTS idx_releases_component_announce_date
      ON releases(claim_component_id, announce_date)
      WHERE announce_date IS NOT NULL;

    UPDATE claim_components
    SET is_active = 0
    WHERE component_type_id = (SELECT id FROM component_types WHERE name = 'Grouper')
      AND claim_type_id IN (
        SELECT id
        FROM claim_types
        WHERE lower(name) LIKE '%outpatient%' OR lower(name) LIKE '%esrd%'
      );
  `);
}

const statements = {
  tracker: db.prepare(`
    SELECT
      cc.id AS componentId,
      ct.id AS claimTypeId,
      ct.name AS claimType,
      ct.description AS claimDescription,
      ct.pricer_only AS pricerOnly,
      ctype.name AS componentType,
      cc.last_update_date AS lastUpdateDate,
      r.id AS releaseId,
      r.version,
      r.status,
      r.announce_date AS announceDate,
      r.dev_deploy_date AS devDeployDate,
      r.dev_complete_date AS devCompleteDate,
      r.ppmo_deploy_date AS ppmoDeployDate,
      r.ppmo_complete_date AS ppmoCompleteDate,
      r.prod_deploy_date AS prodDeployDate,
      r.prod_complete_date AS prodCompleteDate,
      r.release_notes AS releaseNotes,
      r.updated_at AS updatedAt,
      COUNT(a.id) AS attachmentCount
    FROM claim_components cc
    JOIN claim_types ct ON ct.id = cc.claim_type_id
    JOIN component_types ctype ON ctype.id = cc.component_type_id
    LEFT JOIN releases r ON r.id = (
      SELECT r2.id
      FROM releases r2
      WHERE r2.claim_component_id = cc.id
      ORDER BY COALESCE(r2.prod_complete_date, r2.prod_deploy_date, r2.ppmo_complete_date, r2.dev_complete_date, r2.announce_date, r2.updated_at) DESC, r2.id DESC
      LIMIT 1
    )
    LEFT JOIN attachments a ON a.release_id = r.id
    WHERE cc.is_active = 1
    GROUP BY cc.id, r.id
    ORDER BY ct.display_order, ctype.display_order
  `),
  claimTypes: db.prepare('SELECT id, name, description, pricer_only AS pricerOnly, display_order AS displayOrder FROM claim_types ORDER BY display_order'),
  components: db.prepare(`
    SELECT
      cc.id,
      ct.name AS claimType,
      ctype.name AS componentType,
      cc.is_active AS isActive,
      cc.last_update_date AS lastUpdateDate
    FROM claim_components cc
    JOIN claim_types ct ON ct.id = cc.claim_type_id
    JOIN component_types ctype ON ctype.id = cc.component_type_id
    ORDER BY ct.display_order, ctype.display_order
  `),
  releases: db.prepare(`
    SELECT
      r.id,
      r.claim_component_id AS componentId,
      ct.name AS claimType,
      ctype.name AS componentType,
      cc.last_update_date AS lastUpdateDate,
      r.version,
      r.status,
      r.announce_date AS announceDate,
      r.dev_deploy_date AS devDeployDate,
      r.dev_complete_date AS devCompleteDate,
      r.ppmo_deploy_date AS ppmoDeployDate,
      r.ppmo_complete_date AS ppmoCompleteDate,
      r.prod_deploy_date AS prodDeployDate,
      r.prod_complete_date AS prodCompleteDate,
      r.release_notes AS releaseNotes,
      r.created_at AS createdAt,
      r.updated_at AS updatedAt,
      COUNT(a.id) AS attachmentCount
    FROM releases r
    JOIN claim_components cc ON cc.id = r.claim_component_id
    JOIN claim_types ct ON ct.id = cc.claim_type_id
    JOIN component_types ctype ON ctype.id = cc.component_type_id
    LEFT JOIN attachments a ON a.release_id = r.id
    GROUP BY r.id
    ORDER BY COALESCE(r.prod_complete_date, r.prod_deploy_date, r.ppmo_complete_date, r.dev_complete_date, r.announce_date, r.updated_at) DESC, r.id DESC
  `),
  attachmentsByRelease: db.prepare('SELECT id, original_name AS originalName, mime_type AS mimeType, size_bytes AS sizeBytes, description, uploaded_at AS uploadedAt FROM attachments WHERE release_id = ? ORDER BY uploaded_at DESC'),
  attachmentById: db.prepare('SELECT * FROM attachments WHERE id = ?'),
  releaseById: db.prepare('SELECT id FROM releases WHERE id = ?'),
  componentById: db.prepare('SELECT id FROM claim_components WHERE id = ?'),
  releaseByComponentAnnounceDate: db.prepare('SELECT id FROM releases WHERE claim_component_id = ? AND announce_date = ?'),
  insertRelease: db.prepare('INSERT INTO releases (claim_component_id, version, status, announce_date, dev_deploy_date, dev_complete_date, ppmo_deploy_date, ppmo_complete_date, prod_deploy_date, prod_complete_date, release_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id'),
  updateRelease: db.prepare('UPDATE releases SET claim_component_id = ?, version = ?, status = ?, announce_date = ?, dev_deploy_date = ?, dev_complete_date = ?, ppmo_deploy_date = ?, ppmo_complete_date = ?, prod_deploy_date = ?, prod_complete_date = ?, release_notes = ? WHERE id = ? RETURNING id'),
  insertAttachment: db.prepare('INSERT INTO attachments (release_id, original_name, stored_name, mime_type, size_bytes, description) VALUES (?, ?, ?, ?, ?, ?)'),
  updateClaimType: db.prepare('UPDATE claim_types SET name = ?, description = ?, pricer_only = ? WHERE id = ?'),
  updateComponent: db.prepare('UPDATE claim_components SET is_active = ? WHERE id = ?')
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': Buffer.isBuffer(payload) ? 'application/octet-stream' : 'application/json; charset=utf-8',
    ...headers
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseJson(buffer) {
  return buffer.length ? JSON.parse(buffer.toString('utf8')) : {};
}

function cleanDate(value) {
  return value ? String(value) : null;
}

function releasePayload(body) {
  return [
    Number(body.componentId),
    String(body.version || '').trim(),
    body.status || 'Planned',
    cleanDate(body.announceDate),
    cleanDate(body.devDeployDate),
    cleanDate(body.devCompleteDate),
    cleanDate(body.ppmoDeployDate),
    cleanDate(body.ppmoCompleteDate),
    cleanDate(body.prodDeployDate),
    cleanDate(body.prodCompleteDate),
    body.releaseNotes ? String(body.releaseNotes) : null
  ];
}

function saveRelease(body) {
  const payload = releasePayload(body);
  const explicitId = Number(body.id || body.releaseId || 0);
  if (explicitId) {
    if (!statements.releaseById.get(explicitId)) throw new Error('Release not found.');
    return statements.updateRelease.get(...payload, explicitId);
  }

  const componentId = payload[0];
  const announceDate = payload[3];
  if (!announceDate) throw new Error('Announce date is required because it defines the release.');

  const existing = statements.releaseByComponentAnnounceDate.get(componentId, announceDate);
  if (existing) return statements.updateRelease.get(...payload, existing.id);
  return statements.insertRelease.get(...payload);
}

function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) throw new Error('Missing multipart boundary.');
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const parts = [];
  let start = buffer.indexOf(boundary) + boundary.length + 2;
  while (start > boundary.length) {
    const next = buffer.indexOf(boundary, start);
    if (next === -1) break;
    const part = buffer.subarray(start, next - 2);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd > -1) {
      const rawHeaders = part.subarray(0, headerEnd).toString('utf8');
      const data = part.subarray(headerEnd + 4);
      const name = /name="([^"]+)"/.exec(rawHeaders)?.[1];
      const filename = /filename="([^"]*)"/.exec(rawHeaders)?.[1];
      const mimeType = /Content-Type:\s*([^\r\n]+)/i.exec(rawHeaders)?.[1] || 'application/octet-stream';
      if (name) parts.push({ name, filename, mimeType, data });
    }
    start = next + boundary.length + 2;
  }
  return parts;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const safePath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  const ext = path.extname(filePath).toLowerCase();
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
  send(res, 200, fs.readFileSync(filePath), { 'Content-Type': types[ext] || 'application/octet-stream' });
}

function csvValue(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function reportRows() {
  return statements.releases.all();
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/tracker') return send(res, 200, { items: statements.tracker.all() });
  if (req.method === 'GET' && url.pathname === '/api/claim-types') return send(res, 200, { items: statements.claimTypes.all() });
  if (req.method === 'GET' && url.pathname === '/api/components') return send(res, 200, { items: statements.components.all() });
  if (req.method === 'GET' && url.pathname === '/api/releases') return send(res, 200, { items: statements.releases.all() });

  if (req.method === 'POST' && url.pathname === '/api/releases') {
    const body = parseJson(await readBody(req));
    if (!body.componentId || !String(body.version || '').trim() || !body.announceDate) return send(res, 400, { error: 'Component, version, and announce date are required.' });
    const result = saveRelease(body);
    return send(res, 200, { id: result.id });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/claim-types/')) {
    const id = Number(url.pathname.split('/').pop());
    const body = parseJson(await readBody(req));
    if (!id || !body.name) return send(res, 400, { error: 'Claim type name is required.' });
    statements.updateClaimType.run(String(body.name).trim(), body.description || null, body.pricerOnly ? 1 : 0, id);
    db.exec(`
      INSERT OR IGNORE INTO claim_components (claim_type_id, component_type_id)
      SELECT id, 3 FROM claim_types WHERE id = ${id};
      UPDATE claim_components
      SET is_active = CASE
        WHEN component_type_id = 3 THEN 1
        WHEN (SELECT pricer_only FROM claim_types WHERE id = ${id}) = 1 THEN 0
        ELSE 1
      END
      WHERE claim_type_id = ${id};
      INSERT OR IGNORE INTO claim_components (claim_type_id, component_type_id)
      SELECT ${id}, id FROM component_types WHERE (SELECT pricer_only FROM claim_types WHERE id = ${id}) = 0;
    `);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/api/components/')) {
    const id = Number(url.pathname.split('/').pop());
    const body = parseJson(await readBody(req));
    if (!id || !statements.componentById.get(id)) return send(res, 404, { error: 'Component not found.' });
    statements.updateComponent.run(body.isActive ? 1 : 0, id);
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname.match(/^\/api\/releases\/\d+\/attachments$/)) {
    const id = Number(url.pathname.split('/')[3]);
    return send(res, 200, { items: statements.attachmentsByRelease.all(id) });
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/releases\/\d+\/attachments$/)) {
    const releaseId = Number(url.pathname.split('/')[3]);
    if (!statements.releaseById.get(releaseId)) return send(res, 404, { error: 'Release not found.' });
    const parts = parseMultipart(await readBody(req), req.headers['content-type']);
    const file = parts.find(part => part.name === 'file' && part.filename);
    const description = parts.find(part => part.name === 'description')?.data.toString('utf8') || null;
    if (!file || !file.data.length) return send(res, 400, { error: 'Attachment file is required.' });
    const storedName = `${Date.now()}-${Math.random().toString(16).slice(2)}-${path.basename(file.filename).replace(/[^a-z0-9._-]/gi, '_')}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), file.data);
    statements.insertAttachment.run(releaseId, file.filename, storedName, file.mimeType, file.data.length, description);
    return send(res, 201, { ok: true });
  }

  if (req.method === 'GET' && url.pathname.match(/^\/api\/attachments\/\d+\/download$/)) {
    const attachment = statements.attachmentById.get(Number(url.pathname.split('/')[3]));
    if (!attachment) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    const file = path.join(UPLOAD_DIR, attachment.stored_name);
    if (!fs.existsSync(file)) return send(res, 404, 'File missing', { 'Content-Type': 'text/plain' });
    return send(res, 200, fs.readFileSync(file), {
      'Content-Type': attachment.mime_type,
      'Content-Disposition': `attachment; filename="${attachment.original_name.replaceAll('"', '')}"`
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/reports/releases.csv') {
    const rows = reportRows();
    const columns = ['claimType', 'componentType', 'version', 'status', 'lastUpdateDate', 'announceDate', 'devDeployDate', 'devCompleteDate', 'ppmoDeployDate', 'ppmoCompleteDate', 'prodDeployDate', 'prodCompleteDate', 'attachmentCount', 'releaseNotes'];
    const csv = [columns.join(','), ...rows.map(row => columns.map(col => csvValue(row[col])).join(','))].join('\n');
    return send(res, 200, csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="microdyn-release-report.csv"' });
  }

  if (req.method === 'GET' && url.pathname === '/api/reports/releases.json') return send(res, 200, { generatedAt: new Date().toISOString(), items: reportRows() });

  send(res, 404, { error: 'API route not found.' });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    handleApi(req, res).catch(error => send(res, 500, { error: error.message }));
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`MicroDyn MA Release Tracker running at http://localhost:${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
});
