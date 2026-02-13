const AUTH_EMAIL = 'youredik@gmail.com';

async function run() {
  // Auth
  const authResp = await fetch('http://localhost:3000/api/auth/dev/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: AUTH_EMAIL })
  });
  const { accessToken } = await authResp.json();
  console.log('✓ Auth OK');

  const headers = { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' };

  const endpoints = [
    { method: 'GET', path: '/api/health' },
    { method: 'GET', path: '/api/auth/me' },
    { method: 'GET', path: '/api/workspaces' },
    { method: 'GET', path: '/api/sections' },
    { method: 'GET', path: '/api/users' },
    { method: 'GET', path: '/api/roles' },
    { method: 'GET', path: '/api/entity-types' },
    { method: 'GET', path: '/api/tasks' },
    { method: 'GET', path: '/api/chat/rooms' },
    { method: 'GET', path: '/api/knowledge-base/documents' },
    { method: 'GET', path: '/api/knowledge-base/faq' },
    { method: 'GET', path: '/api/notifications' },
    { method: 'GET', path: '/api/bpmn/definitions' },
    { method: 'GET', path: '/api/bpmn/instances' },
    { method: 'GET', path: '/api/sla/configs' },
    { method: 'GET', path: '/api/permissions/registry' },
    { method: 'GET', path: '/api/dmn/tables' },
  ];

  const results = [];

  for (const ep of endpoints) {
    try {
      const resp = await fetch('http://localhost:3000' + ep.path, { method: ep.method, headers });
      const isJson = resp.headers.get('content-type')?.includes('json');
      let body = null;
      let bodySize = 0;

      if (isJson) {
        body = await resp.json();
        bodySize = JSON.stringify(body).length;
      } else {
        bodySize = (await resp.text()).length;
      }

      const ok = resp.status < 400;
      const items = Array.isArray(body) ? body.length : (body?.data?.length || '-');

      results.push({ path: ep.path, status: resp.status, ok, items, bodySize });
      console.log(`${ok ? '✓' : '✗'} ${resp.status} ${ep.path} ${Array.isArray(body) ? `(${body.length} items)` : ''} [${bodySize}b]`);
    } catch (err) {
      results.push({ path: ep.path, status: 'ERR', ok: false, error: err.message.substring(0, 80) });
      console.log(`✗ ERR ${ep.path}: ${err.message.substring(0, 80)}`);
    }
  }

  // Test workspace-specific endpoints
  const wsResp = await fetch('http://localhost:3000/api/workspaces', { headers });
  const workspaces = await wsResp.json();
  if (workspaces.length > 0) {
    const wsId = workspaces[0].id;
    console.log(`\nWorkspace endpoints (ws=${workspaces[0].name}):`);

    for (const path of [
      `/api/workspaces/${wsId}`,
      `/api/workspaces/${wsId}/entities`,
      `/api/workspaces/${wsId}/members`,
    ]) {
      try {
        const r = await fetch('http://localhost:3000' + path, { headers });
        const b = await r.json();
        const items = Array.isArray(b) ? b.length : (b?.data?.length || '-');
        console.log(`${r.status < 400 ? '✓' : '✗'} ${r.status} ${path} (${items} items)`);
      } catch (err) {
        console.log(`✗ ${path}: ${err.message.substring(0, 60)}`);
      }
    }
  }

  const failed = results.filter(r => !r.ok);
  console.log('\n=== API AUDIT ===');
  console.log(`Endpoints: ${results.length}, Passed: ${results.filter(r => r.ok).length}, Failed: ${failed.length}`);
  if (failed.length > 0) console.log('Failures:', JSON.stringify(failed, null, 2));
}

run().catch(console.error);
