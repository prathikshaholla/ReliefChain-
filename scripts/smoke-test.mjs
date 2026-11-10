// ============================================================================
// npm run test:smoke - end-to-end API test against a running app.
//   1. npm run dev   (in another terminal)
//   2. npm run test:smoke            (BASE_URL defaults to http://localhost:3000)
// It performs a real dispatch + delivery, so run `npm run db:reset` afterwards
// to get the pristine demo dataset back.
// Owner: Member 1 (Database Architect & Core Backend)
// ============================================================================

const BASE = process.env.BASE_URL || 'http://localhost:3000';
let passed = 0;
let failed = 0;

function check(name, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function login(email, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  return r.data.token;
}

try {
  console.log(`Smoke testing ${BASE}\n\nAuthentication`);
  const admin = await login('admin@reliefchain.org', 'admin123');
  const logistics = await login('logistics@reliefchain.org', 'logistics123');
  const responder = await login('responder@reliefchain.org', 'responder123');
  check('three demo accounts can sign in', admin && logistics && responder);
  check('wrong password is rejected (401)', (await api('/api/auth/login', { method: 'POST', body: { email: 'admin@reliefchain.org', password: 'nope' } })).status === 401);
  check('no token -> 401', (await api('/api/dashboard')).status === 401);
  check('/api/auth/me returns the session', (await api('/api/auth/me', { token: responder })).data.user?.role === 'FIRST_RESPONDER');

  console.log('\nRead endpoints');
  for (const path of ['/api/dashboard', '/api/camps', '/api/requests', '/api/inventory', '/api/dispatch', '/api/sos', '/api/sql-lab', '/api/telemetry?window=all']) {
    const r = await api(path, { token: admin });
    check(`GET ${path}`, r.status === 200 && r.data.success, `(status ${r.status}: ${r.data.error ?? ''})`);
  }

  console.log('\nRole-based access control');
  check('responder cannot dispatch (403)', (await api('/api/dispatch', { token: responder, method: 'POST', body: { requestId: 2, warehouseId: 1, vehicleId: 2, allocatedQty: 1 } })).status === 403);
  check('responder cannot restock (403)', (await api('/api/inventory', { token: responder, method: 'POST', body: { warehouseId: 1, categoryId: 1, restockQuantity: 5 } })).status === 403);
  check('logistics cannot use SQL Lab (403)', (await api('/api/sql-lab', { token: logistics, method: 'POST', body: { sql: 'SELECT 1' } })).status === 403);

  console.log('\nACID dispatch (sp_process_resource_dispatch)');
  const near = await api('/api/dispatch?requestId=2', { token: logistics });
  check('Haversine ranking returns depots nearest-first', near.data.nearestWarehouses?.length > 0 &&
    near.data.nearestWarehouses.every((w, i, a) => i === 0 || Number(a[i - 1].distance_km) <= Number(w.distance_km)));
  const over = await api('/api/dispatch', { token: logistics, method: 'POST', body: { requestId: 2, warehouseId: 1, vehicleId: 2, allocatedQty: 999 } });
  check('over-allocation is rejected by the procedure (400)', over.status === 400, JSON.stringify(over.data));
  const heavy = await api('/api/dispatch', { token: logistics, method: 'POST', body: { requestId: 5, warehouseId: 2, vehicleId: 5, allocatedQty: 500 } });
  check('payload over vehicle capacity is rejected (400)', heavy.status === 400 && /payload/i.test(heavy.data.error ?? ''));
  const ok = await api('/api/dispatch', { token: logistics, method: 'POST', body: { requestId: 2, warehouseId: 1, vehicleId: 2, allocatedQty: 40 } });
  check('valid dispatch commits (201) with tracking code', ok.status === 201 && /^RC-\d{8}-\d+$/.test(ok.data.trackingCode ?? ''), JSON.stringify(ok.data));
  const busy = await api('/api/dispatch', { token: logistics, method: 'POST', body: { requestId: 3, warehouseId: 1, vehicleId: 2, allocatedQty: 10 } });
  check('same vehicle cannot be dispatched twice (400)', busy.status === 400);

  console.log('\nDelivery trigger (trg_shipment_delivery)');
  const shipmentId = ok.data.shipment?.id;
  const delivered = await api(`/api/dispatch/${shipmentId}/status`, { token: responder, method: 'POST', body: { status: 'DELIVERED' } });
  check('responder can confirm delivery', delivered.status === 200, JSON.stringify(delivered.data));
  const again = await api(`/api/dispatch/${shipmentId}/status`, { token: admin, method: 'POST', body: { status: 'FAILED' } });
  check('closed shipment cannot change again (400)', again.status === 400);
  const reqs = (await api('/api/requests', { token: admin })).data.requests ?? [];
  check('request #2 is now FULFILLED', reqs.find((r) => r.id === 2)?.status === 'FULFILLED');
  const fleet = (await api('/api/dispatch', { token: admin })).data.fleet ?? [];
  check('vehicle #2 is AVAILABLE again', fleet.find((v) => v.vehicle_id === 2)?.status === 'AVAILABLE');
  const audit = (await api('/api/dashboard', { token: admin })).data.recentAudit ?? [];
  check('audit trail attributes the delivery to the responder', audit.some((a) => a.action_type === 'DELIVERY' && /Ananya/.test(a.performed_by_name ?? '')));

  console.log('\nVector search (pgvector)');
  const sos = await api('/api/sos', { token: responder, method: 'POST', body: { senderName: 'Smoke Test', victimCount: 3, zoneId: 2, message: 'Grandfather needs insulin, he is diabetic and we have no medicine left' } });
  check('SOS ingested with 384-dim vector', sos.status === 201 && sos.data.semanticAnalysis?.vectorDimensions === 384);
  check('SOS classified as insulin/medicine', sos.data.semanticAnalysis?.topMatch?.categoryCode === 'MED-02', JSON.stringify(sos.data.semanticAnalysis?.topMatch));
  const search = await api('/api/semantic-search', { token: admin, method: 'POST', body: { queryText: 'diabetic patient out of insulin' } });
  const top = search.data.matchedSignals?.[0];
  check('nearest neighbour is an insulin message', /insulin/i.test(top?.raw_message ?? ''), JSON.stringify(top));

  console.log('\nSQL Lab safety');
  const presets = (await api('/api/sql-lab', { token: admin })).data.presets ?? [];
  for (const p of presets) {
    const r = await api('/api/sql-lab', { token: admin, method: 'POST', body: { sql: p.sql } });
    check(`preset "${p.title}"`, r.status === 200, `(status ${r.status}: ${r.data.error ?? ''})`);
  }
  check('DELETE is refused (403)', (await api('/api/sql-lab', { token: admin, method: 'POST', body: { sql: 'DELETE FROM users' } })).status === 403);
  check('stacked statement is refused', (await api('/api/sql-lab', { token: admin, method: 'POST', body: { sql: 'SELECT 1; DROP TABLE users' } })).status >= 400);
  check('write hidden in a CTE is refused by READ ONLY', (await api('/api/sql-lab', { token: admin, method: 'POST', body: { sql: 'WITH d AS (DELETE FROM users RETURNING *) SELECT * FROM d' } })).status === 403);
  check('users table still intact', (await api('/api/auth/login', { method: 'POST', body: { email: 'admin@reliefchain.org', password: 'admin123' } })).status === 200);

  console.log('\nMongoDB');
  const tel = await api('/api/telemetry?window=24', { token: admin });
  check('aggregation pipeline returns zone rollups', tel.data.aggregationPipeline?.data?.length > 0);
  const inc = await api('/api/telemetry', { token: responder, method: 'POST', body: { category: 'RESCUE_OPERATION', severity: 'HIGH', headline: 'Smoke test incident', zoneId: 1 } });
  check('incident document inserted', inc.status === 201);
} catch (err) {
  failed++;
  console.error('\nSmoke test crashed:', err.message, '\nIs the app running (npm run dev)?');
}

console.log(`\n${passed} passed, ${failed} failed`);
console.log('Tip: run `npm run db:reset` to restore the demo dataset.');
process.exit(failed ? 1 : 0);
