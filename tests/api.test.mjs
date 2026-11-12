import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Exercise the SQL actually used by routes against the generated schema.
const base = new URL('../', import.meta.url);
const source = (path) => readFileSync(new URL(path, base), 'utf8');
const migration = source('drizzle/0000_blue_yellow_claw.sql');
const route = Object.fromEntries(['works', 'deals', 'ledger', 'import'].map(name => [name, source(`app/api/${name}/route.ts`)]));
function sql(name, starts) {
  const found = [...route[name].matchAll(/db\.prepare\("([^"]+)"\)/g)].map(m => m[1]).find(q => q.startsWith(starts));
  assert.ok(found, `Expected production query: ${name}/${starts}`);
  return found;
}
function database(t) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(migration);
  t.after(() => db.close());
  return db;
}
function work(db, owner, id, title = id) {
  db.prepare(sql('works', 'INSERT INTO')).run(owner, id, JSON.stringify({id, title}));
}
function deal(db, owner, id, workId) {
  db.prepare(sql('deals', 'INSERT INTO')).run(owner, id, workId, JSON.stringify({id, workId}));
}

test('tenant-local primary keys permit same IDs without mixing ledger reads', (t) => {
  const db = database(t);
  work(db, 'alice', 'same', 'Alice artwork');
  work(db, 'bob', 'same', 'Bob artwork');
  deal(db, 'alice', 'same-deal', 'same');
  deal(db, 'bob', 'same-deal', 'same');
  const rows = db.prepare(sql('ledger', 'SELECT data FROM works')).all('alice');
  assert.deepEqual(rows.map(r => JSON.parse(r.data).title), ['Alice artwork']);
  assert.equal(db.prepare(sql('ledger', 'SELECT data FROM deals')).all('alice').length, 1);
});

test('work/deal updates and deletes cannot target another tenant', (t) => {
  const db = database(t);
  work(db, 'bob', 'bob-work');
  work(db, 'alice', 'alice-work');
  deal(db, 'bob', 'bob-deal', 'bob-work');
  assert.equal(db.prepare(sql('works', 'UPDATE works')).run('{}', 'alice', 'bob-work').changes, 0);
  assert.equal(db.prepare(sql('deals', 'UPDATE deals')).run('alice-work', '{}', 'alice', 'bob-deal').changes, 0);
  assert.equal(db.prepare(sql('deals', 'DELETE FROM deals')).run('alice', 'bob-deal').changes, 0);
  assert.equal(db.prepare(sql('works', 'DELETE FROM works')).run('alice', 'bob-work').changes, 0);
  assert.equal(db.prepare(sql('ledger', 'SELECT data FROM works')).all('bob').length, 1);
  assert.equal(db.prepare(sql('ledger', 'SELECT data FROM deals')).all('bob').length, 1);
});

test('compound foreign key rejects cross-tenant and missing artwork references', (t) => {
  const db = database(t);
  work(db, 'bob', 'bob-work');
  assert.throws(() => deal(db, 'alice', 'cross-tenant', 'bob-work'), /FOREIGN KEY/);
  assert.throws(() => deal(db, 'bob', 'orphan', 'missing'), /FOREIGN KEY/);
  work(db, 'alice', 'alice-work');
  deal(db, 'alice', 'valid', 'alice-work');
  assert.throws(() => db.prepare(sql('deals', 'UPDATE deals')).run('bob-work', '{}', 'alice', 'valid'), /FOREIGN KEY/);
});

test('foreign key blocks deleting a work while records remain, even after an earlier precheck', (t) => {
  const db = database(t);
  work(db, 'alice', 'artwork');
  assert.equal(db.prepare(sql('works', 'SELECT id FROM deals')).get('alice', 'artwork'), undefined);
  deal(db, 'alice', 'license', 'artwork');
  assert.throws(() => db.prepare(sql('works', 'DELETE FROM works')).run('alice', 'artwork'), /FOREIGN KEY/);
  db.prepare(sql('deals', 'DELETE FROM deals')).run('alice', 'license');
  assert.equal(db.prepare(sql('works', 'DELETE FROM works')).run('alice', 'artwork').changes, 1);
});

test('import upserts alter only the importing tenant, preserving other records', (t) => {
  const db = database(t);
  work(db, 'alice', 'same', 'Original');
  work(db, 'bob', 'same', 'Private Bob');
  work(db, 'alice', 'retained');
  db.prepare(sql('import', 'INSERT INTO works')).run('alice', 'same', JSON.stringify({id:'same', title:'Restored'}));
  db.prepare(sql('import', 'INSERT INTO deals')).run('alice', 'license', 'same', '{}');
  assert.equal(JSON.parse(db.prepare('SELECT data FROM works WHERE owner_id=? AND id=?').get('bob', 'same').data).title, 'Private Bob');
  assert.equal(db.prepare(sql('ledger', 'SELECT data FROM works')).all('alice').length, 2);
  assert.equal(JSON.parse(db.prepare('SELECT data FROM works WHERE owner_id=? AND id=?').get('alice', 'same').data).title, 'Restored');
});

test('transactional import rolls back prior writes when a later reference fails', (t) => {
  const db = database(t);
  work(db, 'alice', 'existing', 'Original');
  // D1 batch provides the transaction; this verifies the same query sequence and constraints.
  db.exec('BEGIN');
  try {
    db.prepare(sql('import', 'INSERT INTO works')).run('alice', 'existing', JSON.stringify({id:'existing', title:'Changed'}));
    db.prepare(sql('import', 'INSERT INTO works')).run('alice', 'new-work', '{}');
    db.prepare(sql('import', 'INSERT INTO deals')).run('alice', 'invalid', 'missing', '{}');
    assert.fail('Import must fail on an orphan reference');
  } catch (error) {
    db.exec('ROLLBACK');
    assert.match(error.message, /FOREIGN KEY/);
  }
  assert.equal(db.prepare(sql('ledger', 'SELECT data FROM works')).all('alice').length, 1);
  assert.equal(JSON.parse(db.prepare('SELECT data FROM works WHERE owner_id=? AND id=?').get('alice','existing').data).title, 'Original');
});
