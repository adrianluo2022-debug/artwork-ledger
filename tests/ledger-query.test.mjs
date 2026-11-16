import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesKeywords, dealSearchFields, filterDeals, summarizeSales } from '../lib/ledger-query.mjs';

const work = (extra = {}) => ({ id: 'w1', title: '春日花园', createdDate: '2022-03-04', notes: '水彩 蓝色', ...extra });
const deal = (extra = {}) => ({ id: 'd1', workId: 'w1', kind: 'license', client: 'ACME', domain: '出版', amount: 1200, paid: 300, soldDate: '2026-11-12', startDate: '2026-12-01', endDate: '2027-12-01', notes: '第二版', ...extra });
const ids = (values) => values.map((value) => value.id);

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

test('keyword matching normalizes full-width text, case and Unicode whitespace', () => {
  assert.equal(matchesKeywords('  ＡＣＭＥ　蓝色\n出版 ', ['AcMe', '蓝色 水彩', '出版']), true);
  assert.equal(matchesKeywords('ABC 123', ['ａｂｃ', '１２３']), true);
  assert.equal(matchesKeywords('授权', ['商业授权']), true);
});

test('all query tokens must match, and empty query always matches', () => {
  assert.equal(matchesKeywords('花园 出版', ['春日花园', '出版']), true);
  assert.equal(matchesKeywords('花园 包装', ['春日花园', '出版']), false);
  assert.equal(matchesKeywords('不存在', []), false);
  assert.equal(matchesKeywords(' \t\n　', []), true);
});

test('search fields include artwork, transaction, prices, labels and valid date variants', () => {
  const fields = dealSearchFields(deal({ perpetual: true, exclusive: true }), work());
  for (const query of ['春日花园', '水彩', 'ACME', '出版', '第二版', '1200', '300', '授权', '长期', '独家', '2022-03-04', '2022.3.4', '2026/11/12', '2026/12/1', '2027年12月1日']) {
    assert.equal(matchesKeywords(query, fields), true, query);
  }
  assert.equal(matchesKeywords('约稿', dealSearchFields(deal({ kind: 'commission' }))), true);
  assert.equal(matchesKeywords('2026.2.30', dealSearchFields(deal({ soldDate: '2026-02-30' }))), false);
});

test('filters combine linked artwork keywords and transaction kind', () => {
  const works = [work(), work({ id: 'w2', title: '夜色', notes: '油画' })];
  const deals = [deal(), deal({ id: 'd2', kind: 'commission' }), deal({ id: 'd3', workId: 'w2' })];
  assert.deepEqual(ids(filterDeals(works, deals, { query: '花园 acme 出版', kind: 'license' })), ['d1']);
  assert.deepEqual(ids(filterDeals(works, deals, { query: '花园', kind: 'commission' })), ['d2']);
  assert.deepEqual(filterDeals(works, deals, { query: '不存在' }), []);
});

test('date bounds are inclusive and work independently', () => {
  const deals = [deal({ id: 'before', soldDate: '2026-11-10' }), deal({ id: 'start', soldDate: '2026-11-11' }), deal({ id: 'end', soldDate: '2026-11-12' }), deal({ id: 'after', soldDate: '2026-11-13' })];
  assert.deepEqual(ids(filterDeals([], deals, { startDate: '2026-11-11', endDate: '2026-11-12' })), ['end', 'start']);
  assert.deepEqual(ids(filterDeals([], deals, { startDate: '2026-11-12' })), ['after', 'end']);
  assert.deepEqual(ids(filterDeals([], deals, { endDate: '2026-11-11' })), ['start', 'before']);
  assert.deepEqual(ids(filterDeals([], deals, { startDate: '2026-11-12', endDate: '2026-11-12' })), ['end']);
});

test('bounded searches exclude year-only, missing and invalid sale dates', () => {
  const deals = [deal({ id: 'year', soldDate: '2026' }), deal({ id: 'empty', soldDate: '' }), deal({ id: 'invalid', soldDate: '2026-02-30' }), deal({ id: 'missing', soldDate: undefined }), deal({ id: 'valid' })];
  assert.deepEqual(ids(filterDeals([], deals, { startDate: '2026-01-01' })), ['valid']);
  assert.deepEqual(ids(filterDeals([], deals, { endDate: '2026-12-31' })), ['valid']);
  assert.deepEqual(ids(filterDeals([], deals)), ['valid', 'year', 'empty', 'invalid', 'missing']);
});

test('invalid or reversed bounds return no records instead of normalizing dates', () => {
  for (const startDate of ['2026-02-30', '1900-02-29', '2026-13-01', '2026-00-01', '0000-01-01', '2026', '2026-1-01', '2026/01/01']) {
    assert.deepEqual(filterDeals([], [deal()], { startDate }), [], startDate);
  }
  assert.deepEqual(filterDeals([], [deal()], { endDate: '2026-04-31' }), []);
  assert.deepEqual(filterDeals([], [deal()], { startDate: '2026-11-13', endDate: '2026-11-12' }), []);
});

test('leap-day filtering uses calendar dates without timezone conversion', () => {
  const deals = [deal({ id: 'leap', soldDate: '2024-02-29' }), deal({ id: 'before', soldDate: '2024-02-28' }), deal({ id: 'after', soldDate: '2024-03-01' }), deal({ id: 'century', soldDate: '2000-02-29' })];
  assert.deepEqual(ids(filterDeals([], deals, { startDate: '2024-02-29', endDate: '2024-02-29' })), ['leap']);
  assert.deepEqual(ids(filterDeals([], deals, { startDate: '2000-02-29', endDate: '2000-02-29' })), ['century']);
});

test('summary sums contracted amounts in integer cents and groups exact dates', () => {
  const result = summarizeSales([deal({ amount: 0.1, paid: 0 }), deal({ amount: 0.2, paid: 0.1 }), deal({ amount: 1.05, paid: 999, soldDate: '2026-11-13' })]);
  assert.deepEqual(result, { amount: 1.35, count: 3, days: [{ date: '2026-11-13', amount: 1.05, count: 1 }, { date: '2026-11-12', amount: 0.3, count: 2 }], undated: { amount: 0, count: 0 } });
});

test('summary includes year-only and unknown dates in undated total without inventing days', () => {
  const result = summarizeSales([deal({ amount: 20, soldDate: '2026' }), deal({ amount: 30, soldDate: '' }), deal({ amount: 40, soldDate: undefined }), deal({ amount: 50, soldDate: '2026-02-30' }), deal({ amount: 0, soldDate: '2024-02-29' })]);
  assert.deepEqual(result, { amount: 140, count: 5, days: [{ date: '2024-02-29', amount: 0, count: 1 }], undated: { amount: 140, count: 4 } });
});

test('sorting is stable, exact dates precede year-only dates, and inputs stay unchanged', () => {
  const works = deepFreeze([work()]);
  const deals = deepFreeze([deal({ id: 'year-new', soldDate: '2028' }), deal({ id: 'first' }), deal({ id: 'old', soldDate: '2025-12-31' }), deal({ id: 'second' }), deal({ id: 'year-old', soldDate: '2025' }), deal({ id: 'unknown', soldDate: '' })]);
  const before = JSON.stringify({ works, deals });
  assert.deepEqual(ids(filterDeals(works, deals)), ['first', 'second', 'old', 'year-new', 'year-old', 'unknown']);
  summarizeSales(deals);
  dealSearchFields(deals[0], works[0]);
  assert.equal(JSON.stringify({ works, deals }), before);
});

test('empty or unmatched datasets have zero counts and amounts', () => {
  assert.deepEqual(filterDeals(), []);
  assert.deepEqual(summarizeSales(), { amount: 0, count: 0, days: [], undated: { amount: 0, count: 0 } });
  assert.deepEqual(summarizeSales(filterDeals([work()], [deal()], { query: '不存在' })), { amount: 0, count: 0, days: [], undated: { amount: 0, count: 0 } });
});