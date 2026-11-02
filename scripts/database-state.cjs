const crypto = require('node:crypto');
const { Client } = require('pg');
const q = name => '"' + name.replace(/"/g, '""') + '"';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function fingerprint(client) {
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  const identity = (await client.query("SELECT current_database() AS database, current_setting('server_version') AS version, current_setting('transaction_read_only') AS \"readOnly\"")).rows[0];
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(x => x.tablename);
  const data = {};
  for (const table of tables) {
    const result = (await client.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(h, '' ORDER BY h), '')) AS digest
      FROM (SELECT md5(row_to_json(t)::text) AS h FROM public.${q(table)} t) hashed`)).rows[0];
    data[table] = result;
  }
  const columns = (await client.query(`SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale, datetime_precision
    FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations' ORDER BY table_name,column_name`)).rows;
  const constraints = (await client.query(`SELECT t.relname AS table_name,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname<>'_prisma_migrations' AND c.contype<>'n' ORDER BY t.relname,c.conname`)).rows;
  const indexes = (await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename,indexname")).rows;
  const enums = (await client.query("SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder")).rows;
  const sequenceStructure = (await client.query(`SELECT s.sequencename,s.data_type,s.start_value::text,s.min_value::text,s.max_value::text,s.increment_by::text,s.cycle,s.cache_size::text,
    t.relname AS owner_table,a.attname AS owner_column
    FROM pg_sequences s JOIN pg_class seq ON seq.relname=s.sequencename AND seq.relnamespace='public'::regnamespace
    LEFT JOIN pg_depend d ON d.objid=seq.oid AND d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
    LEFT JOIN pg_class t ON t.oid=d.refobjid LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
    WHERE s.schemaname='public' ORDER BY s.sequencename`)).rows;
  const sequences = {};
  for (const seq of sequenceStructure) sequences[seq.sequencename] = (await client.query(`SELECT last_value::text,is_called FROM public.${q(seq.sequencename)}`)).rows[0];
  const extras = {
    routines: (await client.query("SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.proname,definition")).rows,
    triggers: (await client.query("SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname")).rows,
    views: (await client.query("SELECT viewname,definition FROM pg_views WHERE schemaname='public' ORDER BY viewname")).rows,
    materializedViews: (await client.query("SELECT matviewname,definition FROM pg_matviews WHERE schemaname='public' ORDER BY matviewname")).rows,
    policies: (await client.query("SELECT tablename,policyname,permissive,roles::text,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname")).rows,
    rls: (await client.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname<>'_prisma_migrations' ORDER BY relname")).rows,
    extensions: (await client.query('SELECT extname,extversion FROM pg_extension ORDER BY extname')).rows,
  };
  const totals = {};
  for (const [table, names] of Object.entries({ Pago:['monto'], Deuda:['monto'], Factura:['subtotal','iva','total','totalPagado','creditoAplicado','saldo'], IngresoRapido:['monto'], Compra:['total'], Gasto:['monto'], Producto:['stock'] })) {
    totals[table] = (await client.query(`SELECT ${names.map(n => `coalesce(sum(${q(n)}::numeric),0)::text AS ${q(n)}`).join(',')} FROM public.${q(table)}`)).rows[0];
  }
  const history = tables.includes('_prisma_migrations') ? (await client.query('SELECT migration_name,checksum,finished_at IS NOT NULL AS completed,rolled_back_at IS NOT NULL AS reverted FROM public."_prisma_migrations" ORDER BY migration_name,started_at')).rows : [];
  const structure = { columns, constraints, indexes, enums, sequenceStructure, extras };
  return { identity, data, sequences, totals, history, structure, structureDigest: sha(JSON.stringify(structure)) };
}

function differences(left, right, includeHistory = true) {
  const result = [];
  for (const section of ['data','sequences','totals','structure']) {
    const a = { ...left[section] }, b = { ...right[section] };
    if (!includeHistory && section === 'data') { delete a._prisma_migrations; delete b._prisma_migrations; }
    if (JSON.stringify(a) !== JSON.stringify(b)) result.push(section);
  }
  return result;
}

async function inspectDatabase(connectionString) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 6000, statement_timeout: 20000, application_name: 'hero_baseline_readonly_verification', options: '-c default_transaction_read_only=on -c lock_timeout=2000' });
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const state = await fingerprint(client);
    await client.query('ROLLBACK');
    return state;
  } finally { await client.end(); }
}
module.exports = { fingerprint, differences, inspectDatabase, sha };
