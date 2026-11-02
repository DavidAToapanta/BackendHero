// Defaults to read-only verification. --apply must be supplied explicitly.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseEnv } = require('node:util');
const { inspectDatabase, differences, sha } = require('./database-state.cjs');

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith('--')) {
    throw new Error(`Missing ${name}`);
  }
  return process.argv[index + 1];
}

function prisma(args, connectionString) {
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, DATABASE_URL: connectionString, DIRECT_URL: connectionString,
      PRISMA_HIDE_UPDATE_MESSAGE: 'true', CHECKPOINT_DISABLE: '1' },
  });
  const output = ((result.stdout || '') + (result.stderr || '')).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]');
  if (result.status !== 0) throw new Error(`Prisma ${args.slice(0, 2).join(' ')} failed (${result.status}): ${output}`);
  return output.trim();
}

(async () => {
  const expectedDatabase = argument('--database');
  const envFile = argument('--env-file');
  const backupManifestFile = argument('--backup-manifest');
  const apply = process.argv.includes('--apply');
  const config = parseEnv(fs.readFileSync(envFile, 'utf8'));
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL missing from explicit environment file');
  const target = new URL(config.DATABASE_URL);
  if (decodeURIComponent(target.pathname.slice(1)) !== expectedDatabase) throw new Error('Database URL does not match --database');
  if ((target.searchParams.get('schema') || 'public') !== 'public') throw new Error('Only the verified public schema is allowed');

  const verified = JSON.parse(fs.readFileSync('docs/BASELINE_VERIFICADA_2026-11-01.json'));
  const migrations = fs.readdirSync('prisma/migrations', { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
  if (migrations.length !== 1 || migrations[0] !== '0_init') throw new Error('Active migrations changed; rehearse the new version first');
  if (sha(fs.readFileSync('prisma/migrations/0_init/migration.sql')) !== verified.baselineSha256 ||
      sha(fs.readFileSync('prisma/schema.prisma', 'utf8').replace(/\r\n/g, '\n')) !== verified.schemaSha256) throw new Error('Verified baseline or schema changed');

  const backup = JSON.parse(fs.readFileSync(backupManifestFile));
  const backupDir = path.dirname(path.resolve(backupManifestFile));
  const restore = JSON.parse(fs.readFileSync(path.join(backupDir, 'restore-verification.json')));
  const snapshot = JSON.parse(fs.readFileSync(path.join(backupDir, 'source-fingerprint.json')));
  if (backup.sourceDatabase !== verified.sourceDatabase || snapshot.identity.database !== verified.sourceDatabase ||
      restore.differences.length !== 0 || snapshot.structureDigest !== verified.structureDigest ||
      sha(fs.readFileSync(backup.path)) !== backup.sha256 || fs.statSync(backup.path).size !== backup.bytes) {
    throw new Error('Backup or restore verification failed');
  }
  const backupAgeMinutes = Math.floor((Date.now() - fs.statSync(backup.path).mtimeMs) / 60000);
  if (apply && backupAgeMinutes > 60) throw new Error('Backup is older than 60 minutes; make and verify a fresh backup before applying');

  const before = await inspectDatabase(config.DATABASE_URL);
  if (before.identity.database !== expectedDatabase || before.identity.readOnly !== 'on') throw new Error('Server identity or read-only check failed');
  if (before.structureDigest !== verified.structureDigest) throw new Error('Schema differs from the rehearsed baseline');
  const legacy = before.history.filter(row => row.migration_name !== '0_init');
  if (JSON.stringify(legacy) !== JSON.stringify(verified.expectedLegacyHistory)) throw new Error('Legacy history changed; investigate instead of overwriting');
  const marker = before.history.filter(row => row.migration_name === '0_init');
  if (marker.length > 1 || marker.some(row => row.checksum !== verified.baselineSha256 || !row.completed || row.reverted)) {
    throw new Error('Unexpected existing baseline record');
  }

  const readonlyUrl = new URL(config.DATABASE_URL);
  readonlyUrl.searchParams.set('options', '-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=2000');
  prisma(['migrate', 'diff', '--from-schema-datasource', 'prisma/schema.prisma', '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'], readonlyUrl.toString());
  console.log(JSON.stringify({ database: expectedDatabase, mode: apply ? 'apply-baseline-metadata' : 'read-only',
    schemaMatches: true, legacyHistoryMatches: true, backupHashVerified: true, backupAgeMinutes,
    baselineAlreadyRecorded: marker.length === 1, businessTables: Object.keys(before.data).length - 1 }));
  if (!apply) return;

  // This is the sole mutation: Prisma records a baseline whose objects already exist.
  // Do not execute the baseline SQL or any archived migration on this database.
  if (!marker.length) console.log(prisma(['migrate', 'resolve', '--applied', '0_init', '--schema', 'prisma/schema.prisma'], config.DATABASE_URL));
  const after = await inspectDatabase(config.DATABASE_URL);
  const changed = differences(before, after, false);
  const historicalRowsPreserved = JSON.stringify(after.history.filter(row => row.migration_name !== '0_init')) === JSON.stringify(legacy);
  const baselineRows = after.history.filter(row => row.migration_name === '0_init');
  const baselineRecorded = baselineRows.length === 1 && baselineRows[0].completed && !baselineRows[0].reverted && baselineRows[0].checksum === verified.baselineSha256;
  const evidenceDir = path.resolve('.tmp');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const evidenceFile = path.join(evidenceDir, `baseline-${expectedDatabase.replace(/[^A-Za-z0-9_-]/g, '_')}-${Date.now()}.json`);
  fs.writeFileSync(evidenceFile, JSON.stringify({ database: expectedDatabase, before, after, changed, historicalRowsPreserved, baselineRecorded }, null, 2));
  if (changed.length || !historicalRowsPreserved || !baselineRecorded) throw new Error('Post-change verification failed; inspect the saved evidence. Do not restore production automatically.');
  console.log(prisma(['migrate', 'status', '--schema', 'prisma/schema.prisma'], readonlyUrl.toString()));
  console.log(JSON.stringify({ verified: true, businessDataChanged: false, historicalRowsPreserved, baselineRecorded, evidenceFile }));
})().catch(error => {
  console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]'));
  process.exitCode = 1;
});
