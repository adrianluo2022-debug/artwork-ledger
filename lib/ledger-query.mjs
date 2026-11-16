/** Search and reporting helpers. These functions do not modify stored records. */
function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= lengths[month - 1];
}

function validYear(value) {
  return typeof value === 'string' && /^\d{4}$/.test(value) && Number(value) > 0;
}

function dateVariants(value) {
  if (!validDay(value)) return [];
  const [year, month, day] = value.split('-');
  return [
    `${year}.${month}.${day}`,
    `${year}/${month}/${day}`,
    `${year}.${Number(month)}.${Number(day)}`,
    `${year}/${Number(month)}/${Number(day)}`,
    `${year}年${Number(month)}月${Number(day)}日`,
  ];
}

export function matchesKeywords(query, fieldsArray = []) {
  const normalized = normalize(query);
  if (!normalized) return true;
  const searchable = fieldsArray.map(normalize).join(' ');
  return normalized.split(' ').every((token) => searchable.includes(token));
}

export function dealSearchFields(deal = {}, work = {}) {
  const dates = [work?.createdDate, deal?.soldDate, deal?.startDate, deal?.endDate];
  return [
    work?.title,
    work?.notes,
    work?.createdDate,
    deal?.client,
    deal?.domain,
    deal?.notes,
    deal?.soldDate,
    deal?.startDate,
    deal?.endDate,
    deal?.amount,
    deal?.paid,
    deal?.kind === 'commission' ? '约稿' : deal?.kind === 'license' ? '授权' : '',
    deal?.perpetual ? '长期授权 永久授权' : '',
    deal?.exclusive ? '独家授权' : '',
    ...dates.flatMap(dateVariants),
  ];
}

function datePrecision(value) {
  return validDay(value) ? 2 : validYear(value) ? 1 : 0;
}

export function filterDeals(works = [], deals = [], { query = '', startDate = '', endDate = '', kind = '' } = {}) {
  const bounded = Boolean(startDate || endDate);
  if ((startDate && !validDay(startDate)) || (endDate && !validDay(endDate))) return [];
  if (startDate && endDate && startDate > endDate) return [];
  const workById = new Map(works.map((work) => [work.id, work]));
  return deals
    .map((deal, index) => ({ deal, index }))
    .filter(({ deal }) => {
      if (kind && deal.kind !== kind) return false;
      if (!matchesKeywords(query, dealSearchFields(deal, workById.get(deal.workId)))) return false;
      if (!bounded) return true;
      if (!validDay(deal.soldDate)) return false;
      return (!startDate || deal.soldDate >= startDate) && (!endDate || deal.soldDate <= endDate);
    })
    .sort((a, b) => {
      const precisionA = datePrecision(a.deal.soldDate);
      const precisionB = datePrecision(b.deal.soldDate);
      if (precisionA !== precisionB) return precisionB - precisionA;
      if (precisionA && a.deal.soldDate !== b.deal.soldDate) return a.deal.soldDate < b.deal.soldDate ? 1 : -1;
      return a.index - b.index;
    })
    .map(({ deal }) => deal);
}

export function summarizeSales(deals = []) {
  const byDay = new Map();
  let totalCents = 0;
  let undatedCents = 0;
  let undatedCount = 0;
  for (const deal of deals) {
    const cents = typeof deal.amount === 'number' && Number.isFinite(deal.amount) ? Math.round(deal.amount * 100) : 0;
    totalCents += cents;
    if (!validDay(deal.soldDate)) {
      undatedCents += cents;
      undatedCount += 1;
      continue;
    }
    const day = byDay.get(deal.soldDate) || { cents: 0, count: 0 };
    day.cents += cents;
    day.count += 1;
    byDay.set(deal.soldDate, day);
  }
  return {
    amount: totalCents / 100,
    count: deals.length,
    days: [...byDay.entries()]
      .sort(([a], [b]) => a < b ? 1 : a > b ? -1 : 0)
      .map(([date, day]) => ({ date, amount: day.cents / 100, count: day.count })),
    undated: { amount: undatedCents / 100, count: undatedCount },
  };
}