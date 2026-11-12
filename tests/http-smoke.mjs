import assert from 'node:assert/strict';

// Explicitly local-only. Run manually after starting the dev server on port 5187.
// These marked QA fixtures are retained for browser verification; no records are deleted.
const origin = 'http://127.0.0.1:5187';
const cookieName = '__sites_local_auth';
let cookie = '';
let checks = 0;
async function request(path, {method = 'GET', data, authenticated = true, expected = 200, headers = {}} = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(authenticated && cookie ? {Cookie: cookie} : {}),
      ...(data !== undefined ? {'Content-Type': 'application/json', Origin: origin} : {}),
      ...headers,
    },
    ...(data !== undefined ? {body: JSON.stringify(data)} : {}),
    signal: AbortSignal.timeout(30000),
  });
  const responseText = await response.text();
  let value;
  try { value = JSON.parse(responseText); } catch { value = {response:responseText.slice(0,500)}; }
  assert.equal(response.status, expected, `${method} ${path}: expected ${expected}, received ${response.status}; ${JSON.stringify(value)}`);
  checks++;
  return value;
}

await request('/api/ledger', {authenticated: false, expected: 401});
const login = await fetch(`${origin}/signin-with-chatgpt?return_to=/`, {redirect:'manual', signal:AbortSignal.timeout(30000)});
assert.equal(login.status, 302, 'Local sign-in must redirect');
cookie = (login.headers.getSetCookie().find(value => value.startsWith(`${cookieName}=`)) ?? '').split(';')[0];
assert.equal(cookie, `${cookieName}=1`, 'Local development sign-in cookie is required');
checks++;

const initial = await request('/api/ledger');
assert.ok(Array.isArray(initial.works) && Array.isArray(initial.deals));
const qaNote = '本地 QA 测试记录，用于验证工作台；不属于真实业务数据。';
const artwork = {
  id: 'qa-local-work', title: '暮色花园 · 测试作品', createdDate: '2024', image: '', notes: qaNote,
};
const licenses = [
  {id:'qa-local-license-a', workId:artwork.id, kind:'license', client:'青禾出版社 · 测试', domain:'出版 / 书籍封面', amount:2800, paid:1400, soldDate:'2025', startDate:'2025-11-27', endDate:'2026-11-26', perpetual:false, exclusive:false, notes:qaNote},
  {id:'qa-local-license-b', workId:artwork.id, kind:'license', client:'山野文创 · 测试', domain:'文创 / 包装', amount:4200, paid:4200, soldDate:'2026-11-01', startDate:'2026-11-01', endDate:'2027-10-31', perpetual:false, exclusive:false, notes:qaNote},
];

async function createFixture(path, fixture, records) {
  const old = records.find(row => row.id === fixture.id);
  if (old) assert.equal(old.notes, qaNote, 'Refusing to overwrite a record not marked as this test fixture');
  const saved = await request(path, {method: old ? 'PUT' : 'POST', data:fixture, expected:old ? 200 : 201});
  assert.equal(saved.id, fixture.id);
  return saved;
}
const savedWork = await createFixture('/api/works', artwork, initial.works);
assert.equal(savedWork.createdDate, '2024', 'Year-only creation date must be preserved');
await createFixture('/api/deals', licenses[0], initial.deals);
await createFixture('/api/deals', licenses[1], initial.deals);

const edited = {...licenses[0], amount:3200, paid:1600};
await request('/api/deals', {method:'PUT', data:edited});
let current = await request('/api/ledger');
assert.equal(current.deals.find(deal => deal.id === edited.id).amount, 3200);
assert.equal(current.deals.find(deal => deal.id === edited.id).paid, 1600);
assert.equal(current.deals.filter(deal => deal.workId === artwork.id).length, 2, 'One artwork must support two separate license records');

await request('/api/works', {method:'POST', data:{...artwork,id:'qa-invalid-calendar',createdDate:'2026-02-30'}, expected:400});
await request('/api/deals', {method:'POST', data:{...licenses[0],id:'qa-invalid-end',startDate:'2026-12-01',endDate:'2026-11-01'}, expected:400});
await request('/api/deals', {method:'POST', data:{...licenses[0],id:'qa-invalid-paid',paid:2800.01}, expected:400});
await request('/api/deals', {method:'POST', data:{...licenses[0],id:'qa-invalid-origin'}, expected:403, headers:{Origin:'https://untrusted.example','Sec-Fetch-Site':'cross-site'}});
await request('/api/works', {method:'POST', data:{...artwork,id:'qa-unauthenticated'}, authenticated:false, expected:401});

const restored = {...edited,amount:3600,paid:1800};
const imported = await request('/api/import', {method:'POST',data:{version:1,works:[artwork],deals:[restored,licenses[1]]}});
assert.equal(imported.works,1);
assert.equal(imported.deals,2);
current = await request('/api/ledger');
assert.equal(current.deals.find(deal => deal.id === restored.id).amount,3600);
assert.equal(current.deals.find(deal => deal.id === restored.id).paid,1800);
assert.equal(current.works.filter(work => work.id === artwork.id).length,1,'Import must merge same artwork ID');
assert.equal(current.deals.filter(deal => deal.workId === artwork.id).length,2,'Import must merge same license IDs');
assert.equal(current.deals.find(deal => deal.id === licenses[0].id).soldDate,'2025','Year-only transaction date must be preserved');
await request(`/api/works?id=${artwork.id}`, {method:'DELETE',expected:409,headers:{Origin:origin}});
current = await request('/api/ledger');
assert.ok(current.works.some(work => work.id === artwork.id),'Blocked deletion must retain the artwork');
assert.ok(!current.works.some(work => ['qa-invalid-calendar','qa-unauthenticated'].includes(work.id)));
assert.ok(!current.deals.some(deal => deal.id.startsWith('qa-invalid-')));

console.log(`HTTP smoke passed: ${checks} responses verified against local port 5187; 1 artwork and 2 license QA fixtures retained.`);
