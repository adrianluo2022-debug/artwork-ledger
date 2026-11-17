import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseExactDate, formatCalendarDate, monthCells, localTodayISO } from '../lib/calendar.mjs';

const moduleUrl = new URL('../lib/calendar.mjs', import.meta.url).href;

function runWithTimezone(timezone, source) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    encoding: 'utf8', env: { ...process.env, TZ: timezone },
  }).trim();
}

test('parser accepts only exact calendar dates, including leap-century rules', () => {
  for (const value of ['2024-02-29', '2000-02-29', '2026-11-17']) {
    assert.equal(formatCalendarDate(parseExactDate(value)), value);
  }
  for (const value of ['', '2026', '2026-2-01', '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', ' 2026-01-01', '2026-01-01T00:00:00Z', null, undefined, 2026]) {
    assert.equal(parseExactDate(value), null, String(value));
  }
});

test('parsed values are local noon and formatting does not mutate them', () => {
  const parsed = parseExactDate('2026-11-17');
  const stamp = parsed.getTime();
  assert.deepEqual([parsed.getHours(), parsed.getMinutes(), parsed.getSeconds(), parsed.getMilliseconds()], [12, 0, 0, 0]);
  assert.equal(formatCalendarDate(parsed), '2026-11-17');
  assert.equal(parsed.getTime(), stamp);
  assert.equal(formatCalendarDate(new Date(NaN)), '');
  assert.equal(formatCalendarDate(null), '');
});

test('years below 100 keep their exact year instead of becoming 1900-based', () => {
  for (const value of ['0001-01-01', '0099-12-31', '0100-01-01', '9999-12-31']) {
    const parsed = parseExactDate(value);
    assert.equal(parsed.getFullYear(), Number(value.slice(0, 4)));
    assert.equal(formatCalendarDate(parsed), value);
  }
  for (const value of ['0000-01-01', '-001-01-01', '10000-01-01', '未知']) assert.equal(parseExactDate(value), null);
});

test('month grid always has 42 cells and begins on Monday', () => {
  const cells = monthCells(2026, 11);
  assert.equal(cells.length, 42);
  assert.equal(cells[0].date, '2026-10-26');
  assert.equal(parseExactDate(cells[0].date).getDay(), 1);
  assert.equal(cells.at(-1).date, '2026-12-06');
  assert.equal(cells.filter((cell) => cell.inMonth).length, 30);
  assert.deepEqual(Object.keys(cells[0]), ['date', 'day', 'inMonth', 'lunar']);
});

test('January and December grids contain correct adjacent-year dates', () => {
  const january = monthCells(2027, 1);
  assert.equal(january[0].date, '2026-12-28');
  assert.equal(january.at(-1).date, '2027-02-07');
  const december = monthCells(2026, 12);
  assert.equal(december[0].date, '2026-11-30');
  assert.equal(december.at(-1).date, '2027-01-10');
  assert.equal(december[0].inMonth, false);
  assert.equal(december[1].inMonth, true);
});

test('February includes leap day and all grid dates are consecutive', () => {
  const cells = monthCells(2024, 2);
  assert.equal(cells[0].date, '2024-01-29');
  assert.equal(cells.at(-1).date, '2024-03-10');
  assert.equal(cells.filter((cell) => cell.inMonth).length, 29);
  assert.equal(cells.find((cell) => cell.date === '2024-02-29').day, 29);
  for (let index = 1; index < cells.length; index += 1) {
    const previous = parseExactDate(cells[index - 1].date);
    previous.setDate(previous.getDate() + 1);
    assert.equal(formatCalendarDate(previous), cells[index].date);
  }
});

test('year endpoints remain usable and unsupported padding is disabled by empty date', () => {
  const first = monthCells(1, 1);
  assert.equal(first[0].date, '0001-01-01');
  assert.equal(first.length, 42);
  const last = monthCells(9999, 12);
  assert.equal(last.length, 42);
  assert.equal(last.filter((cell) => cell.inMonth).length, 31);
  assert.ok(last.some((cell) => cell.date === ''));
  for (const cell of last.filter((item) => !item.date)) assert.deepEqual([cell.inMonth, cell.lunar], [false, '']);
  for (const [year, month] of [[0, 1], [10000, 1], [2026, 0], [2026, 13], [2026.5, 1], [2026, 1.5], ['2026', 11], [NaN, 1], [undefined, 1]]) {
    assert.throws(() => monthCells(year, month), RangeError);
  }
});

test('Chinese lunar labels use month name on day one and familiar day names after it', () => {
  let supported = false;
  try { supported = new Intl.DateTimeFormat('zh-CN-u-ca-chinese').resolvedOptions().calendar === 'chinese'; } catch {}
  const cells = monthCells(2026, 2);
  const first = cells.find((cell) => cell.date === '2026-02-17');
  const second = cells.find((cell) => cell.date === '2026-02-18');
  if (supported) {
    assert.equal(first.lunar, '正月');
    assert.equal(second.lunar, '初二');
  } else {
    assert.equal(first.lunar, '');
    assert.equal(second.lunar, '');
  }
});

test('calendar still works when Intl lunar calendar support is unavailable', () => {
  const source = `globalThis.Intl = undefined; const {monthCells} = await import(${JSON.stringify(moduleUrl)}); const cells = monthCells(2026, 11); console.log(JSON.stringify({length:cells.length,empty:cells.every(c=>c.lunar==='')}));`;
  assert.deepEqual(JSON.parse(runWithTimezone('Asia/Shanghai', source)), { length: 42, empty: true });
});

test('date-only formatting and month grids do not shift in positive or negative timezones', () => {
  const source = `const {parseExactDate,formatCalendarDate,monthCells}=await import(${JSON.stringify(moduleUrl)});const values=['2026-11-17','2026-03-08','2026-11-01'];console.log(JSON.stringify({dates:values.map(v=>formatCalendarDate(parseExactDate(v))),hours:values.map(v=>parseExactDate(v).getHours()),first:monthCells(2026,3)[0].date,last:monthCells(2026,3).at(-1).date}));`;
  for (const zone of ['Asia/Shanghai', 'America/Los_Angeles', 'Pacific/Auckland']) {
    assert.deepEqual(JSON.parse(runWithTimezone(zone, source)), { dates: ['2026-11-17', '2026-03-08', '2026-11-01'], hours: [12, 12, 12], first: '2026-02-23', last: '2026-04-05' }, zone);
  }
});

test('today follows local calendar fields', () => {
  const current = new Date();
  const expected = `${String(current.getFullYear()).padStart(4, '0')}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
  assert.equal(localTodayISO(), expected);
});