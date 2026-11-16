import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWorkbench } from '../lib/workbench-query.mjs';

const TODAY = '2026-11-16';
const work = (extra = {}) => ({ id: 'w1', title: '春日花园', notes: '蓝色水彩', createdDate: '2025-03-04', ...extra });
const deal = (extra = {}) => ({ id: 'd1', workId: 'w1', kind: 'license', client: 'ACME', domain: '出版', notes: '', soldDate: '2026-11-16', amount: 100, paid: 20, startDate: '2026-10-01', endDate: '2026-12-01', perpetual: false, ...extra });
const select = (works, deals, options = {}) => selectWorkbench(works, deals, { today: TODAY, ...options });
const ids = (records) => records.map((record) => record.id);

function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
}

test('unfiltered works view includes unsold works and all deals', () => {
  const result = select([work(), work({ id: 'unsold', title: '新作' })], [deal()]);
  assert.deepEqual(ids(result.works), ['w1', 'unsold']);
  assert.deepEqual(ids(result.deals), ['d1']);
  assert.equal(result.amount, 100);
  assert.equal(result.count, 1);
  assert.equal(result.invalidRange, false);
  assert.deepEqual(select([], []), { works: [], deals: [], amount: 0, count: 0, unknownDateCount: 0, invalidRange: false });
});

test('work fields match every linked deal and can independently match unsold works', () => {
  const works = [work(), work({ id: 'unsold', title: '春日小路' }), work({ id: 'other', title: '夜色' })];
  const deals = [deal(), deal({ id: 'd2', amount: 200, notes: '不同客户' })];
  const result = select(works, deals, { query: '春日' });
  assert.deepEqual(ids(result.works), ['w1', 'unsold']);
  assert.equal(result.count, 2);
  assert.equal(result.amount, 300);
  assert.deepEqual(ids(select(works, deals, { query: '2025.3.4' }).works), ['w1', 'unsold', 'other']);
});

test('transaction keyword search sums only the matching deal, including cross-field AND tokens', () => {
  const deals = [deal({ notes: '限量签名版', amount: 0.1 }), deal({ id: 'd2', notes: '普通版', amount: 99 })];
  const result = select([work()], deals, { query: '花园 ＡＣＭＥ 限量' });
  assert.deepEqual(ids(result.works), ['w1']);
  assert.deepEqual(ids(result.deals), ['d1']);
  assert.equal(result.amount, 0.1);
  assert.deepEqual(select([work()], deals, { query: '不存在' }).works, []);
});

test('date, domain and status must match the same transaction', () => {
  const works = [work(), work({ id: 'unsold' })];
  const deals = [deal({ id: 'right-domain', soldDate: '2026-10-01', paid: 100 }), deal({ id: 'right-date', domain: '包装', paid: 0 }), deal({ id: 'right-status', domain: '服装', soldDate: '2025-11-16', paid: 0 })];
  const options = { startDate: '2026-11-16', endDate: '2026-11-16', domain: '出版', status: 'unpaid' };
  assert.deepEqual(select(works, deals, options).works, []);
  const result = select(works, [...deals, deal({ id: 'all', domain: ' 出版 ', amount: 25, paid: 0 })], { ...options, domain: ' 出版 ' });
  assert.deepEqual(ids(result.works), ['w1']);
  assert.deepEqual(ids(result.deals), ['all']);
  assert.equal(result.amount, 25);
});

test('commission and license views scope both records and matching works', () => {
  const works = [work(), work({ id: 'w2', title: '夜色' }), work({ id: 'unsold' })];
  const deals = [deal(), deal({ id: 'commission', workId: 'w2', kind: 'commission', amount: 200 })];
  const commissioned = select(works, deals, { view: 'commission' });
  assert.deepEqual(ids(commissioned.works), ['w2']);
  assert.deepEqual(ids(commissioned.deals), ['commission']);
  assert.equal(commissioned.amount, 200);
  const licensed = select(works, deals, { view: 'license' });
  assert.deepEqual(ids(licensed.works), ['w1']);
  assert.deepEqual(ids(licensed.deals), ['d1']);
});

test('unknown date count uses query/kind/domain/status scope before date bounds', () => {
  const deals = [deal({ id: 'year', soldDate: '2026', notes: '特选' }), deal({ id: 'empty', soldDate: '', notes: '特选' }), deal({ id: 'exact', notes: '特选' }), deal({ id: 'other-domain', soldDate: '', domain: '包装', notes: '特选' }), deal({ id: 'other-kind', kind: 'commission', soldDate: '', notes: '特选' }), deal({ id: 'paid', soldDate: '', paid: 100, notes: '特选' }), deal({ id: 'other-query', soldDate: '', notes: '常规' })];
  const result = select([work()], deals, { view: 'license', query: '特选', domain: '出版', status: 'unpaid', startDate: '2026-01-01' });
  assert.equal(result.unknownDateCount, 2);
  assert.deepEqual(ids(result.deals), ['exact']);
  assert.equal(result.count, 1);
});

test('date filters are inclusive; invalid calendar days and reversed ranges are flagged', () => {
  const deals = [deal({ id: 'start', soldDate: '2024-02-29' }), deal({ id: 'end', soldDate: '2024-03-01' }), deal({ id: 'after', soldDate: '2024-03-02' })];
  assert.deepEqual(ids(select([work()], deals, { startDate: '2024-02-29', endDate: '2024-03-01' }).deals), ['end', 'start']);
  for (const options of [{ startDate: '2026-02-29' }, { endDate: '1900-02-29' }, { startDate: '2026' }, { startDate: '2026-11-17', endDate: '2026-11-16' }, { today: '2026-02-30' }]) {
    const result = select([work()], deals, options);
    assert.equal(result.invalidRange, true);
    assert.deepEqual(result.works, []);
    assert.deepEqual(result.deals, []);
    assert.equal(result.amount, 0);
  }
});

test('due status includes today and day30, excludes future starts, expired and perpetual licenses', () => {
  const deals = [deal({ id: 'today', endDate: TODAY }), deal({ id: 'day30', endDate: '2026-12-16' }), deal({ id: 'day31', endDate: '2026-12-17' }), deal({ id: 'future-start', startDate: '2026-11-17' }), deal({ id: 'no-start', startDate: '' }), deal({ id: 'expired', endDate: '2026-11-15' }), deal({ id: 'forever', perpetual: true }), deal({ id: 'commission', kind: 'commission' }), deal({ id: 'invalid', endDate: '2026-11-31' })];
  assert.deepEqual(ids(select([work()], deals, { status: 'due' }).deals), ['today', 'day30', 'no-start']);
  const leap = [deal({ id: 'leap-edge', endDate: '2024-03-01', startDate: '' }), deal({ id: 'too-late', endDate: '2024-03-02', startDate: '' })];
  assert.deepEqual(ids(select([work()], leap, { status: 'due', today: '2024-01-31' }).deals), ['leap-edge']);
});

test('expired status is strictly earlier than today; unpaid applies to both kinds', () => {
  const deals = [deal({ id: 'expired', endDate: '2026-11-15', paid: 100 }), deal({ id: 'today', endDate: TODAY, paid: 100 }), deal({ id: 'perpetual', perpetual: true, endDate: '2026-11-15', paid: 100 }), deal({ id: 'commission', kind: 'commission', endDate: '2026-11-15', paid: 0 }), deal({ id: 'license-unpaid', paid: 0 }), deal({ id: 'free', amount: 0, paid: 0 })];
  assert.deepEqual(ids(select([work()], deals, { status: 'expired' }).deals), ['expired']);
  assert.deepEqual(ids(select([work()], deals, { status: 'unpaid' }).deals), ['commission', 'license-unpaid']);
});

test('amounts use integer cents and selection never changes source records', () => {
  const works = deepFreeze([work(), work({ id: 'unsold' })]);
  const deals = deepFreeze([deal({ amount: 0.1, paid: 0 }), deal({ id: 'd2', amount: 0.2, paid: 0, soldDate: '2026-11-17' })]);
  const before = JSON.stringify({ works, deals });
  const result = select(works, deals, { status: 'unpaid' });
  assert.equal(result.amount, 0.3);
  assert.equal(result.count, 2);
  assert.deepEqual(ids(result.deals), ['d2', 'd1']);
  assert.equal(JSON.stringify({ works, deals }), before);
});