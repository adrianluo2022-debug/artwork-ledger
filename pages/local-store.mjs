import { validateWork, validateDeal, validateBackup } from '../lib/validation.mjs';

const DATABASE_NAME = 'huabu-artwork-ledger-v1';
const STORES = ['works', 'deals'];
const ORDER_FIELD = '__insertedAt';
let databasePromise;
let persistenceRequested = false;

function storageError(error) {
  if (error?.name === 'QuotaExceededError') return new Error('浏览器存储空间不足。请先导出备份，再释放空间或缩小作品缩略图。');
  if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') return new Error('浏览器禁止了本地存储。请允许此网站保存数据，并使用普通浏览窗口。');
  if (error?.name === 'ConstraintError') return new Error('这个编号的记录已经存在，请刷新后重试。');
  if (error?.name === 'InvalidStateError' || error?.name === 'VersionError') return new Error('本地数据库暂时不可用，请关闭其他画簿页面后刷新重试。');
  if (error?.name === 'UnknownError' || error?.name === 'AbortError') return new Error('本地数据保存未完成。请保留备份并重试，原有记录不会被部分覆盖。');
  return error instanceof Error ? error : new Error('无法读取或保存本地记录，请刷新后重试。');
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('当前浏览器不支持本地数据库，请使用新版 Chrome、Edge、Firefox 或 Safari。'));
      return;
    }
    let settled = false;
    let request;
    try { request = indexedDB.open(DATABASE_NAME, 1); }
    catch (error) { reject(storageError(error)); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        const store = db.objectStoreNames.contains(name)
          ? request.transaction.objectStore(name)
          : db.createObjectStore(name, { keyPath: 'id' });
        if (!store.indexNames.contains(ORDER_FIELD)) store.createIndex(ORDER_FIELD, ORDER_FIELD);
      }
    };
    request.onblocked = () => {
      settled = true;
      reject(new Error('另一个画簿页面正在占用数据库，请关闭其他画簿页面后重试。'));
    };
    request.onerror = () => { settled = true; reject(storageError(request.error)); };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      db.onversionchange = () => { db.close(); databasePromise = undefined; };
      db.onclose = () => { databasePromise = undefined; };
      settled = true;
      resolve(db);
    };
  }).catch((error) => { databasePromise = undefined; throw error; });
  return databasePromise;
}

function requestPersistentStorage() {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    const pending = globalThis.navigator?.storage?.persist?.();
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  } catch { /* Persistence is optional; writes still use IndexedDB. */ }
}

function withoutInternalFields(value) {
  const { [ORDER_FIELD]: ignored, ...record } = value;
  return record;
}

function newestFirst(values) {
  return values
    .sort((a, b) => (b[ORDER_FIELD] || 0) - (a[ORDER_FIELD] || 0))
    .map(withoutInternalFields);
}

// All IDB-dependent follow-up requests are enqueued inside IDB event callbacks.
// A result is returned only after the transaction commits successfully.
function transaction(db, mode, run) {
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(STORES, mode); }
    catch (error) { reject(storageError(error)); return; }
    let result;
    let failure;
    const orders = {};
    const guard = (callback) => (event) => {
      try { callback(event); }
      catch (error) {
        failure = error;
        try { tx.abort(); } catch { reject(storageError(error)); }
      }
    };
    const context = {
      tx,
      guard,
      result: (value) => { result = value; },
      nextOrder: (name) => ++orders[name],
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(storageError(failure || tx.error || new DOMException('Transaction aborted', 'AbortError')));
    tx.onerror = (event) => { failure ||= event.target?.error || tx.error; };
    if (mode === 'readonly') { guard(() => run(context))(); return; }
    // Transactions on both stores serialize mutations across tabs. Preserve
    // insertion order on edits and allocate monotonic order for new records.
    let remaining = STORES.length;
    for (const name of STORES) {
      const request = tx.objectStore(name).index(ORDER_FIELD).openCursor(null, 'prev');
      request.onsuccess = guard(() => {
        orders[name] = Math.max(Date.now(), request.result?.key || 0);
        remaining -= 1;
        if (!remaining) run(context);
      });
    }
  });
}

function validId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) throw new Error('记录编号无效，请刷新后重试。');
  return value;
}

function writeRecord(context, name, item, mode) {
  const store = context.tx.objectStore(name);
  const request = store.get(item.id);
  request.onsuccess = context.guard(() => {
    const existing = request.result;
    if (mode === 'POST' && existing) throw new Error('这个编号的记录已经存在，请刷新后重试。');
    if (mode === 'PUT' && !existing) throw new Error(name === 'works' ? '作品不存在，请刷新。' : '记录不存在，请刷新。');
    const stored = { ...item, [ORDER_FIELD]: existing?.[ORDER_FIELD] || context.nextOrder(name) };
    if (mode === 'POST') store.add(stored);
    else store.put(stored);
  });
}

function deleteRecord(context, name, id) {
  const store = context.tx.objectStore(name);
  const request = store.get(id);
  request.onsuccess = context.guard(() => {
    if (!request.result) throw new Error(name === 'works' ? '作品已不存在。' : '记录已不存在。');
    store.delete(id);
    context.result({ ok: true });
  });
}

/** Same data contract as the hosted ledger API, without making network requests. */
export async function localApi(path, method = 'GET', body) {
  if (typeof path !== 'string' || !path.startsWith('/api/')) throw new Error('不支持的本地操作。');
  const url = new URL(path, 'https://local.invalid');
  const route = url.pathname;
  const verb = String(method).toUpperCase();
  let payload;
  let id;
  if (route === '/api/ledger' && verb === 'GET') {
    const db = await openDatabase();
    return transaction(db, 'readonly', ({ tx, guard, result }) => {
      const data = { works: [], deals: [] };
      result(data);
      for (const name of STORES) {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = guard(() => { data[name] = newestFirst(request.result); });
      }
    });
  }
  if (route === '/api/import' && verb === 'POST') {
    payload = validateBackup(body);
  } else if ((route === '/api/works' || route === '/api/deals') && (verb === 'POST' || verb === 'PUT')) {
    if (verb === 'PUT') validId(body?.id);
    payload = route === '/api/works' ? validateWork(body) : validateDeal(body);
  } else if ((route === '/api/works' || route === '/api/deals') && verb === 'DELETE') {
    id = validId(url.searchParams.get('id'));
  } else {
    throw new Error('不支持的本地操作。');
  }
  const db = await openDatabase();
  const outcome = await transaction(db, 'readwrite', (context) => {
    if (route === '/api/import') {
      for (const work of payload.works) writeRecord(context, 'works', work, 'UPSERT');
      for (const deal of payload.deals) writeRecord(context, 'deals', deal, 'UPSERT');
      context.result({ ok: true, works: payload.works.length, deals: payload.deals.length });
      return;
    }
    const name = route === '/api/works' ? 'works' : 'deals';
    if (verb === 'DELETE') {
      if (name === 'deals') { deleteRecord(context, name, id); return; }
      const request = context.tx.objectStore('deals').openCursor();
      request.onsuccess = context.guard(() => {
        const cursor = request.result;
        if (!cursor) { deleteRecord(context, 'works', id); return; }
        if (cursor.value.workId === id) throw new Error('这张作品还有约稿或授权记录，请先逐条整理相关记录。');
        cursor.continue();
      });
      return;
    }
    context.result(payload);
    if (name === 'works') { writeRecord(context, name, payload, verb); return; }
    const request = context.tx.objectStore('works').get(payload.workId);
    request.onsuccess = context.guard(() => {
      if (!request.result) throw new Error('请先添加或选择一张作品。');
      writeRecord(context, name, payload, verb);
    });
  });
  if (verb !== 'DELETE') requestPersistentStorage();
  return outcome;
}