import { matchesKeywords, dealSearchFields, filterDeals, summarizeSales } from './ledger-query.mjs';

function monthLength(year, month) {
  return [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= monthLength(year, month);
}

function formatDay(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function localToday() {
  const current = new Date();
  return formatDay(current.getFullYear(), current.getMonth() + 1, current.getDate());
}

// Civil-date arithmetic avoids UTC conversion and daylight-saving shifts.
function addDays(date, count) {
  let [year, month, day] = date.split('-').map(Number);
  day += count;
  while (day > monthLength(year, month)) {
    day -= monthLength(year, month);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return formatDay(year, month, day);
}

function matchesStatus(deal, status, today, dueEnd) {
  if (!status) return true;
  if (status === 'unpaid') return (deal.paid ?? 0) < deal.amount;
  if (deal.kind !== 'license' || deal.perpetual || !validDay(deal.endDate)) return false;
  if (status === 'expired') return deal.endDate < today;
  if (status === 'due') {
    if (deal.startDate && (!validDay(deal.startDate) || deal.startDate > today)) return false;
    return deal.endDate >= today && deal.endDate <= dueEnd;
  }
  return false;
}

/** Select a single, consistent record scope for the three workbench views. */
export function selectWorkbench(works = [], deals = [], {
  view = 'works', query = '', startDate = '', endDate = '', domain = '', status = '', today = localToday(),
} = {}) {
  const kind = view === 'commission' || view === 'commissions' ? 'commission'
    : view === 'license' || view === 'licenses' ? 'license' : '';
  const selectedDomain = String(domain ?? '').trim();
  const invalidRange = Boolean(
    (startDate && !validDay(startDate)) || (endDate && !validDay(endDate))
    || (startDate && endDate && startDate > endDate) || !validDay(today)
  );
  const dueEnd = validDay(today) ? addDays(today, 30) : '';
  const scopedDeals = filterDeals(works, deals, { query, kind }).filter((deal) =>
    (!selectedDomain || String(deal.domain ?? '').trim() === selectedDomain)
    && matchesStatus(deal, status, today, dueEnd)
  );
  const unknownDateCount = summarizeSales(scopedDeals).undated.count;
  if (invalidRange) return { works: [], deals: [], amount: 0, count: 0, unknownDateCount, invalidRange: true };

  const selectedDeals = filterDeals(works, scopedDeals, { startDate, endDate });
  const linkedIds = new Set(selectedDeals.map((deal) => deal.workId));
  const transactional = Boolean(startDate || endDate || selectedDomain || status);
  const selectedWorks = works.filter((work) => linkedIds.has(work.id)
    || (!kind && !transactional && matchesKeywords(query, dealSearchFields({}, work))));
  const summary = summarizeSales(selectedDeals);
  return {
    works: selectedWorks,
    deals: selectedDeals,
    amount: summary.amount,
    count: summary.count,
    unknownDateCount,
    invalidRange: false,
  };
}