import Database from 'better-sqlite3';

const db = new Database('data/infohub_v2.db');

const nowIso = new Date().toISOString();
const rows = db
  .prepare(
    `
      SELECT
        s.id,
        s.name,
        s.status,
        s.enabled,
        s.public_source_id,
        ps.enabled AS public_enabled,
        COUNT(i.id) AS item_count,
        MAX(i.published_at) AS latest_item_at
      FROM sources s
      LEFT JOIN items i ON i.source_id = s.id
      LEFT JOIN public_sources ps ON ps.id = s.public_source_id
      WHERE s.is_public = 1
      GROUP BY
        s.id,
        s.name,
        s.status,
        s.enabled,
        s.public_source_id,
        ps.enabled
      ORDER BY s.id
    `,
  )
  .all();

const candidates = rows.filter(
  (row) =>
    row.public_enabled === 0 &&
    row.enabled === 1 &&
    (row.status === 'error' || Number(row.item_count ?? 0) === 0),
);

const disableStmt = db.prepare(`
  UPDATE sources
  SET
    enabled = 0,
    updated_at = @updated_at
  WHERE id = @id
`);

const cleanup = db.transaction(() => {
  for (const row of candidates) {
    disableStmt.run({
      id: row.id,
      updated_at: nowIso,
    });
  }
});

cleanup();

console.log(
  JSON.stringify(
    {
      disabledCount: candidates.length,
      disabledSources: candidates.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        item_count: row.item_count,
        public_source_id: row.public_source_id,
      })),
    },
    null,
    2,
  ),
);
