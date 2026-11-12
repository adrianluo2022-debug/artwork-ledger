import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWork, validateDeal, validateBackup } from '../lib/validation.mjs';

const work = (extra = {}) => ({ id: 'work_1', title: '春日花园', createdDate: '2023', ...extra });
const deal = (extra = {}) => ({ id: 'deal_1', workId: 'work_1', kind: 'license', domain: '出版', amount: 1250.50, soldDate: '2024-01-12', ...extra });

test('minimal work is normalized, has generated id, and strips extraneous fields', () => {
  const result = validateWork({ title: '  花园  ', ownerId: 'attacker', unknown: 'drop' });
  assert.match(result.id, /^[a-f0-9-]{36}$/);
  assert.equal(result.title, '花园');
  assert.equal(result.createdDate, '');
  assert.equal(result.image, '');
  assert.equal(result.notes, '');
  assert.equal(result.ownerId, undefined);
});

test('work title and lengths are validated', () => {
  for (const title of ['', ' ', 17, 'a'.repeat(161)]) assert.throws(() => validateWork(work({ title })));
  assert.throws(() => validateWork(work({ notes: 'a'.repeat(5001) })));
  assert.throws(() => validateWork(null));
  assert.throws(() => validateWork([]));
});

test('creation and sale dates support year precision or unknown dates', () => {
  assert.equal(validateWork(work()).createdDate, '2023');
  assert.equal(validateDeal(deal({ soldDate: '2020' })).soldDate, '2020');
  assert.equal(validateDeal(deal({ soldDate: '' })).soldDate, '');
  assert.equal(validateWork(work({ createdDate: '0001-01-01' })).createdDate, '0001-01-01');
});

test('calendar validation handles leap years and rejects normalized invalid dates', () => {
  assert.equal(validateWork(work({ createdDate: '2024-02-29' })).createdDate, '2024-02-29');
  assert.equal(validateWork(work({ createdDate: '2000-02-29' })).createdDate, '2000-02-29');
  for (const createdDate of ['2023-02-29', '1900-02-29', '2024-04-31', '2024-00-10', '2024-13-01', '2024-01-00', '2024-1-01', '2024/01/01', '0000', '0000-01-01']) {
    assert.throws(() => validateWork(work({ createdDate })), createdDate);
  }
});

test('license chronology is enforced and year-only term dates rejected', () => {
  assert.throws(() => validateDeal(deal({ startDate: '2026-12-01', endDate: '2026-01-01' })), /不能早于/);
  assert.throws(() => validateDeal(deal({ startDate: '2026' })));
  assert.equal(validateDeal(deal({ startDate: '2026-01-01', endDate: '2026-01-01' })).endDate, '2026-01-01');
});

test('perpetual and commission terms normalize consistently', () => {
  const perpetual = validateDeal(deal({ perpetual: true, endDate: '2023-01-01', startDate: '2024-01-01' }));
  assert.equal(perpetual.endDate, '');
  const commission = validateDeal(deal({ kind: 'commission', domain: '', perpetual: true, exclusive: true, startDate: '2024-01-01', endDate: '2023-01-01' }));
  assert.deepEqual([commission.startDate, commission.endDate, commission.perpetual, commission.exclusive], ['', '', false, false]);
});

test('license requires domain but commissions allow empty domain', () => {
  assert.throws(() => validateDeal(deal({ domain: '  ' })), /用途/);
  assert.equal(validateDeal(deal({ kind: 'commission', domain: '' })).domain, '');
  assert.throws(() => validateDeal(deal({ kind: 'other' })));
});

test('money accepts exact cents but rejects invalid, negative and over-precision values', () => {
  for (const amount of [0, 0.29, 123.45, 1e10]) assert.equal(validateDeal(deal({ amount })).amount, amount);
  for (const amount of [-1, NaN, Infinity, 1e10 + 1, 0.001, '50', null, undefined]) assert.throws(() => validateDeal(deal({ amount })));
  assert.throws(() => validateDeal(deal({ amount: 10, paid: 10.01 })), /超过价格/);
  assert.equal(validateDeal(deal()).paid, 0);
});

test('flags are strictly boolean and identifiers restricted', () => {
  assert.throws(() => validateDeal(deal({ perpetual: 'false' })));
  assert.throws(() => validateDeal(deal({ exclusive: 0 })));
  for (const id of ['x/y', 'x?y', 'a'.repeat(81), 7]) assert.throws(() => validateWork(work({ id })));
  assert.throws(() => validateDeal(deal({ workId: '' })));
});

test('image input accepts bounded raster data URLs only', () => {
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(validateWork(work({ image })).image, image);
  for (const value of ['https://example.com/a.png', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,####', 'data:image/png;base64,AAA', 'data:image/png;base64,' + 'A'.repeat(1024 * 1024)]) {
    assert.throws(() => validateWork(work({ image: value })));
  }
});

test('backup normalizes records and supports legacy versionless exports', () => {
  const result = validateBackup({ works: [work()], deals: [deal()], secrets: 'drop' });
  assert.equal(result.version, 1);
  assert.equal(result.works[0].image, '');
  assert.equal(result.deals[0].paid, 0);
  assert.equal(result.secrets, undefined);
  assert.deepEqual(validateBackup({ works: [], deals: [] }), { version: 1, works: [], deals: [] });
});

test('backup rejects duplicates, orphans and missing IDs for safe repeat imports', () => {
  assert.throws(() => validateBackup({ works: [work(), work()], deals: [] }), /重复/);
  assert.throws(() => validateBackup({ works: [work()], deals: [deal(), deal()] }), /重复/);
  assert.throws(() => validateBackup({ works: [], deals: [deal()] }), /对应/);
  assert.throws(() => validateBackup({ works: [work({ id: '' })], deals: [] }), /编号/);
  assert.throws(() => validateBackup({ works: [work()], deals: [deal({ id: '' })] }), /编号/);
});

test('backup format and size are bounded', () => {
  assert.throws(() => validateBackup({ version: 2, works: [], deals: [] }), /版本/);
  assert.throws(() => validateBackup({ works: [] }), /列表/);
  assert.throws(() => validateBackup({ works: Array(3001).fill(work()), deals: [] }), /3000/);
});