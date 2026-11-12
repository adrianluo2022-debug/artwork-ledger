/** Shared request and backup validation. Only explicitly listed fields are returned. */
const MAX_IMAGE_LENGTH = 1024 * 1024;
const MAX_RECORDS = 3000;

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}格式不正确`);
  }
  return value;
}

function text(value, label, maxLength, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new Error(`${label}需要填写文字`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`请填写${label}`);
  if (normalized.length > maxLength) throw new Error(`${label}不能超过 ${maxLength} 个字符`);
  return normalized;
}

function identifier(value, label, create = false) {
  if ((value === undefined || value === null || value === '') && create) {
    return crypto.randomUUID();
  }
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) {
    throw new Error(`${label}无效`);
  }
  return value;
}

function date(value, label, allowYear = false) {
  const normalized = text(value, label, 10);
  if (!normalized) return '';
  if (allowYear && /^[0-9]{4}$/.test(normalized) && Number(normalized) > 0) return normalized;
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(normalized)) {
    throw new Error(`${label}请填写${allowYear ? '四位年份或 ' : ''}YYYY-MM-DD 日期`);
  }
  const [year, month, day] = normalized.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new Error(`${label}不是有效的日期`);
  }
  return normalized;
}

function money(value, label, optional = false) {
  if (value === undefined && optional) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e10) {
    throw new Error(`${label}需要填写 0 至 10000000000 之间的金额`);
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value))) {
    throw new Error(`${label}最多保留两位小数`);
  }
  return value === 0 ? 0 : value;
}

function flag(value, label) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new Error(`${label}格式不正确`);
  return value;
}

function imageData(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > MAX_IMAGE_LENGTH) {
    throw new Error('作品缩略图不能超过 1 MB');
  }
  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[1].length % 4 !== 0) {
    throw new Error('作品缩略图需要使用 PNG、JPEG 或 WebP 图片');
  }
  return value;
}

export function validateWork(raw) {
  const value = record(raw, '作品');
  return {
    id: identifier(value.id, '作品编号', true),
    title: text(value.title, '作品名字', 160, true),
    createdDate: date(value.createdDate, '创作时间', true),
    image: imageData(value.image),
    notes: text(value.notes, '备注', 5000),
  };
}

export function validateDeal(raw) {
  const value = record(raw, '交易记录');
  if (value.kind !== 'commission' && value.kind !== 'license') {
    throw new Error('请选择约稿或授权');
  }
  const amount = money(value.amount, '价格');
  const paid = money(value.paid, '已收金额', true);
  if (paid > amount) throw new Error('已收金额不能超过价格');
  let startDate = date(value.startDate, '授权开始时间');
  let endDate = date(value.endDate, '授权结束时间');
  let perpetual = flag(value.perpetual, '长期授权');
  let exclusive = flag(value.exclusive, '独家授权');
  if (value.kind === 'commission') {
    startDate = '';
    endDate = '';
    perpetual = false;
    exclusive = false;
  } else if (perpetual) {
    endDate = '';
  } else if (startDate && endDate && endDate < startDate) {
    throw new Error('授权结束时间不能早于开始时间');
  }
  return {
    id: identifier(value.id, '记录编号', true),
    workId: identifier(value.workId, '关联作品编号'),
    kind: value.kind,
    client: text(value.client, '客户', 160),
    domain: text(value.domain, '用途／领域', 160, value.kind === 'license'),
    amount,
    soldDate: date(value.soldDate, '成交时间', true),
    startDate,
    endDate,
    perpetual,
    exclusive,
    paid,
    notes: text(value.notes, '备注', 5000),
  };
}

export function validateBackup(raw) {
  const value = record(raw, '备份');
  if (value.version !== undefined && value.version !== 1) {
    throw new Error('暂不支持这个版本的备份文件');
  }
  if (!Array.isArray(value.works) || !Array.isArray(value.deals)) {
    throw new Error('备份需要包含作品和交易记录列表');
  }
  if (value.works.length > MAX_RECORDS || value.deals.length > MAX_RECORDS) {
    throw new Error(`每次最多导入 ${MAX_RECORDS} 张作品和 ${MAX_RECORDS} 条交易记录`);
  }
  const workIds = new Set();
  const dealIds = new Set();
  const works = value.works.map((rawWork) => {
    const item = record(rawWork, '备份作品');
    identifier(item.id, '备份作品编号');
    const work = validateWork(item);
    if (workIds.has(work.id)) throw new Error('备份中有重复的作品编号');
    workIds.add(work.id);
    return work;
  });
  const deals = value.deals.map((rawDeal) => {
    const item = record(rawDeal, '备份交易');
    identifier(item.id, '备份记录编号');
    const deal = validateDeal(item);
    if (dealIds.has(deal.id)) throw new Error('备份中有重复的交易记录编号');
    if (!workIds.has(deal.workId)) throw new Error('备份中的交易记录没有对应的作品');
    dealIds.add(deal.id);
    return deal;
  });
  return { version: 1, works, deals };
}