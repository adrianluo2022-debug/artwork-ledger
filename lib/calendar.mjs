/** Date-only helpers for the mobile calendar. All Date values use local noon. */
const LUNAR_DAYS = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

let lunarFormatter;
try {
  const formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { day: 'numeric', month: 'long' });
  if (formatter.resolvedOptions().calendar === 'chinese') lunarFormatter = formatter;
} catch { /* Lunar labels are optional on browsers without this calendar. */ }

function localNoon(year, month, day) {
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  return date;
}

export function parseExactDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = localNoon(year, month, day);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day ? date : null;
}

export function formatCalendarDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  if (year < 1 || year > 9999) return '';
  return `${String(year).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function lunarLabel(date) {
  if (!lunarFormatter) return '';
  try {
    const parts = lunarFormatter.formatToParts(date);
    const day = Number(parts.find((part) => part.type === 'day')?.value);
    if (!Number.isInteger(day) || day < 1 || day > 30) return '';
    return day === 1 ? parts.find((part) => part.type === 'month')?.value || '初一' : LUNAR_DAYS[day - 1];
  } catch { return ''; }
}

/** Monday-first, fixed six-week grid. Out-of-range boundary padding has date ''. */
export function monthCells(year, month) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('请选择 1 至 9999 年之间的有效年月。');
  }
  const cursor = localNoon(year, month, 1);
  cursor.setDate(cursor.getDate() - (cursor.getDay() + 6) % 7);
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const date = formatCalendarDate(cursor);
    cells.push({
      date,
      day: cursor.getDate(),
      inMonth: cursor.getFullYear() === year && cursor.getMonth() + 1 === month,
      lunar: date ? lunarLabel(cursor) : '',
    });
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(12, 0, 0, 0);
  }
  return cells;
}

export function localTodayISO() {
  return formatCalendarDate(new Date());
}