#!/usr/bin/env node

/**
 * Stankoff Portal — Comprehensive API Health Audit
 *
 * Tests ALL backend API endpoint groups with correct routes and required params.
 * Discovered from actual controller source code.
 */

const BASE_URL = 'http://localhost:3001';

// --- Helpers -----------------------------------------------------------------

async function request(method, path, { body, token, queryParams } = {}) {
  let url = `${BASE_URL}${path}`;
  if (queryParams) {
    const qs = new URLSearchParams(queryParams).toString();
    url += `?${qs}`;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const start = performance.now();
  let res, text, elapsed;
  try {
    res = await fetch(url, opts);
    text = await res.text();
    elapsed = Math.round(performance.now() - start);
  } catch (err) {
    elapsed = Math.round(performance.now() - start);
    return {
      url, method, status: 0, statusText: 'CONNECTION_REFUSED',
      elapsed, size: 0, body: null,
      error: err.message, cookies: null,
    };
  }

  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }

  return {
    url, method, status: res.status, statusText: res.statusText,
    elapsed, size: text.length, body: json ?? text,
    error: res.ok ? null : (json?.message ?? json?.error ?? text.slice(0, 300)),
    cookies: res.headers.get('set-cookie'),
  };
}

function extractToken(result) {
  if (result.cookies) {
    const m = result.cookies.match(/access_token=([^;]+)/);
    if (m) return m[1];
  }
  if (result.body?.access_token) return result.body.access_token;
  if (result.body?.accessToken) return result.body.accessToken;
  if (result.body?.token) return result.body.token;
  return null;
}

function statusIcon(status) {
  if (status === 0) return '[FAIL]';
  if (status >= 200 && status < 300) return '[ OK ]';
  if (status >= 300 && status < 400) return '[RDIR]';
  if (status >= 400 && status < 500) return '[WARN]';
  return '[ERR ]';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countItems(body) {
  if (!body) return '';
  if (Array.isArray(body)) return `${body.length} items`;
  if (body.data && Array.isArray(body.data)) return `${body.data.length} items`;
  if (body.items && Array.isArray(body.items)) return `${body.items.length} items`;
  if (body.results && Array.isArray(body.results)) return `${body.results.length} results`;
  if (body.permissions && Array.isArray(body.permissions)) return `${body.permissions.length} perms`;
  if (body.categories && typeof body.categories === 'object') return `${Object.keys(body.categories).length} categories`;
  if (body.total !== undefined) return `total=${body.total}`;
  return '';
}

// --- Main --------------------------------------------------------------------

async function main() {
  const W = 105;
  console.log('='.repeat(W));
  console.log('  STANKOFF PORTAL — COMPREHENSIVE API HEALTH AUDIT');
  console.log(`  ${new Date().toISOString()}`);
  console.log(`  Target: ${BASE_URL}`);
  console.log('='.repeat(W));
  console.log();

  // ── Step 1: Auth ──────────────────────────────────────────────────────────
  console.log('[1/3] Authenticating via POST /api/auth/dev/login ...');
  const authResult = await request('POST', '/api/auth/dev/login', {
    body: { email: 'youredik@gmail.com' },
  });

  if (authResult.status === 0) {
    console.error(`\n[FAIL] Backend is not reachable at ${BASE_URL}`);
    console.error(`   Error: ${authResult.error}`);
    console.error('   Make sure the backend is running: npm run dev');
    process.exit(1);
  }

  const token = extractToken(authResult);
  if (!token) {
    console.error('\n[FAIL] Could not extract auth token!');
    console.error(`   Status: ${authResult.status} — ${JSON.stringify(authResult.body).slice(0, 500)}`);
    process.exit(1);
  }
  console.log(`   Auth: ${authResult.status} ${authResult.statusText} (${authResult.elapsed}ms)`);
  console.log(`   Token: ${token.slice(0, 25)}...`);
  console.log();

  // ── Step 2: Discover first workspace ──────────────────────────────────────
  console.log('[2/3] Discovering context IDs ...');
  const wsResult = await request('GET', '/api/workspaces', { token });
  let wsId = null;
  const wsArr = Array.isArray(wsResult.body) ? wsResult.body
    : wsResult.body?.data ?? null;
  if (wsResult.status === 200 && wsArr?.length) {
    wsId = wsArr[0].id;
    console.log(`   Workspaces: ${wsArr.length} found, using "${wsArr[0].name}" (${wsId})`);
  } else {
    console.log(`   [!] Could not list workspaces (status=${wsResult.status})`);
  }

  // Get first entity ID for comments and audit-logs
  let entityId = null;
  if (wsId) {
    const entResult = await request('GET', '/api/entities', { token, queryParams: { workspaceId: wsId } });
    const entArr = Array.isArray(entResult.body) ? entResult.body : entResult.body?.data ?? null;
    if (entArr?.length) {
      entityId = entArr[0].id;
      console.log(`   Entity: using "${entArr[0].title ?? entArr[0].id}" (${entityId})`);
    }
  }
  console.log();

  // ── Step 3: Test all endpoints ────────────────────────────────────────────
  console.log('[3/3] Testing all API endpoint groups...\n');

  const wsQp = wsId ? { workspaceId: wsId } : undefined;

  const endpointGroups = [
    {
      group: 'HEALTH & AUTH',
      endpoints: [
        { m: 'GET',  p: '/api/health',          auth: false, label: 'Health check' },
        { m: 'GET',  p: '/api/auth/me',         auth: true,  label: 'Current user (me)' },
        { m: 'GET',  p: '/api/auth/dev/users',  auth: true,  label: 'Dev users list' },
      ],
    },
    {
      group: 'USERS',
      endpoints: [
        { m: 'GET',  p: '/api/users',           auth: true,  label: 'All users' },
      ],
    },
    {
      group: 'WORKSPACES & SECTIONS',
      endpoints: [
        { m: 'GET',  p: '/api/workspaces',      auth: true,  label: 'List workspaces' },
        { m: 'GET',  p: '/api/sections',         auth: true,  label: 'List sections' },
      ],
    },
    {
      group: 'ENTITIES (CRM)',
      endpoints: [
        { m: 'GET',  p: '/api/entities',         auth: true,  label: 'List entities',       qp: wsQp },
        { m: 'GET',  p: '/api/entities/kanban',   auth: true,  label: 'Kanban view',         qp: wsQp },
        { m: 'GET',  p: '/api/entities/table',    auth: true,  label: 'Table view',          qp: wsQp },
        { m: 'GET',  p: '/api/entities/facets',   auth: true,  label: 'Facets / filters',    qp: wsQp },
        { m: 'GET',  p: '/api/product-categories', auth: true, label: 'Product categories' },
        ...(entityId ? [
          { m: 'GET', p: `/api/comments/entity/${entityId}`, auth: true, label: 'Entity comments' },
        ] : []),
      ],
    },
    {
      group: 'CHAT',
      endpoints: [
        { m: 'GET',  p: '/api/chat/conversations', auth: true, label: 'Conversations' },
      ],
    },
    {
      group: 'KNOWLEDGE BASE',
      endpoints: [
        { m: 'GET',  p: '/api/knowledge-base/articles', auth: true, label: 'KB articles' },
      ],
    },
    {
      group: 'RBAC',
      endpoints: [
        { m: 'GET',  p: '/api/rbac/roles',            auth: true, label: 'Roles' },
        { m: 'GET',  p: '/api/rbac/permissions',       auth: true, label: 'Permissions registry' },
        { m: 'GET',  p: '/api/rbac/permissions/my',    auth: true, label: 'My permissions' },
      ],
    },
    {
      group: 'BPMN / PROCESS ENGINE',
      endpoints: [
        { m: 'GET',  p: '/api/bpmn/tasks/inbox',      auth: true, label: 'Task inbox' },
        ...(wsId ? [
          { m: 'GET', p: `/api/bpmn/definitions/${wsId}`, auth: true, label: 'Process definitions' },
          { m: 'GET', p: '/api/bpmn/triggers',        auth: true, label: 'Triggers (by ws)', qp: wsQp },
          { m: 'GET', p: '/api/bpmn/triggers/executions/recent', auth: true, label: 'Recent trigger executions', qp: { ...wsQp, limit: '5' } },
          { m: 'GET', p: '/api/bpmn/forms',           auth: true, label: 'Form definitions', qp: wsQp },
          { m: 'GET', p: '/api/bpmn/incidents',        auth: true, label: 'Incidents',        qp: wsQp },
          { m: 'GET', p: '/api/bpmn/incidents/count',  auth: true, label: 'Incident count',   qp: wsQp },
        ] : []),
      ],
    },
    {
      group: 'DMN (Decision)',
      endpoints: [
        { m: 'GET',  p: '/api/dmn/tables',  auth: true, label: 'Decision tables', qp: wsQp },
      ],
    },
    {
      group: 'SLA',
      endpoints: [
        { m: 'GET',  p: '/api/sla/definitions', auth: true, label: 'SLA definitions', qp: wsQp },
      ],
    },
    {
      group: 'AI (YandexGPT)',
      endpoints: [
        { m: 'GET',  p: '/api/ai/health',           auth: true, label: 'AI health' },
        { m: 'POST', p: '/api/ai/search',            auth: true, label: 'AI search (RAG)', body: { query: 'test' } },
        { m: 'GET',  p: '/api/ai/knowledge-base/stats', auth: true, label: 'KB stats' },
        { m: 'GET',  p: '/api/ai/indexer/health',    auth: true, label: 'Indexer health' },
        { m: 'GET',  p: '/api/ai/indexer/status',    auth: true, label: 'Indexer status' },
        { m: 'GET',  p: '/api/ai/indexer/stats',     auth: true, label: 'Indexer stats' },
        { m: 'GET',  p: '/api/ai/usage/stats',       auth: true, label: 'AI usage stats' },
        { m: 'GET',  p: '/api/ai/usage/logs',        auth: true, label: 'AI usage logs' },
        { m: 'GET',  p: '/api/ai/notifications',     auth: true, label: 'AI notifications' },
      ],
    },
    {
      group: 'INVITATIONS',
      endpoints: [
        { m: 'GET',  p: '/api/invitations', auth: true, label: 'List invitations' },
      ],
    },
    {
      group: 'AUDIT LOGS',
      endpoints: [
        ...(wsId ? [
          { m: 'GET', p: `/api/audit-logs/workspace/${wsId}`, auth: true, label: 'Workspace audit logs' },
        ] : []),
        ...(entityId ? [
          { m: 'GET', p: `/api/audit-logs/entity/${entityId}`, auth: true, label: 'Entity audit logs' },
        ] : []),
      ],
    },
    {
      group: 'ANALYTICS',
      endpoints: [
        { m: 'GET',  p: '/api/analytics/global',    auth: true, label: 'Global analytics' },
        ...(wsId ? [
          { m: 'GET', p: `/api/analytics/workspace/${wsId}`, auth: true, label: 'Workspace analytics' },
        ] : []),
      ],
    },
    {
      group: 'SEARCH',
      endpoints: [
        { m: 'GET',  p: '/api/search', auth: true, label: 'Global search', qp: { q: 'test' } },
      ],
    },
    {
      group: 'LEGACY',
      endpoints: [
        { m: 'GET',  p: '/api/legacy/system-sync/status', auth: true, label: 'Legacy sync status' },
      ],
    },
    {
      group: 'AUTOMATION',
      endpoints: [
        ...(wsId ? [
          { m: 'GET', p: '/api/automation', auth: true, label: 'Automation rules', qp: wsQp },
        ] : []),
      ],
    },
    {
      group: 'CONNECTORS',
      endpoints: [
        { m: 'GET',  p: '/api/connectors', auth: true, label: 'Connectors' },
      ],
    },
    {
      group: 'ONBOARDING',
      endpoints: [
        { m: 'GET',  p: '/api/onboarding/status', auth: true, label: 'Onboarding status' },
      ],
    },
    {
      group: 'RECOMMENDATIONS',
      endpoints: [
        ...(wsId ? [
          { m: 'GET', p: '/api/recommendations/assignees', auth: true, label: 'Recommend assignees',
            qp: { workspaceId: wsId, title: 'Тестовая заявка', limit: '3' } },
          { m: 'GET', p: '/api/recommendations/priority', auth: true, label: 'Recommend priority',
            qp: { workspaceId: wsId, title: 'Тестовая заявка' } },
        ] : []),
      ],
    },
  ];

  const allResults = [];

  for (const group of endpointGroups) {
    if (group.endpoints.length === 0) continue;
    const dashLen = Math.max(0, 90 - group.group.length - 5);
    console.log(`--- ${group.group} ${'─'.repeat(dashLen)}`);

    for (const ep of group.endpoints) {
      const opts = {};
      if (ep.auth) opts.token = token;
      if (ep.body) opts.body = ep.body;
      if (ep.qp) opts.queryParams = ep.qp;

      const res = await request(ep.m, ep.p, opts);
      const icon = statusIcon(res.status);
      const statusStr = `${res.status} ${res.statusText}`;
      const timeStr = `${res.elapsed}ms`;
      const sizeStr = formatSize(res.size);

      let items = '';
      if (res.status >= 200 && res.status < 300) {
        const c = countItems(res.body);
        if (c) items = ` (${c})`;
      }

      const pathDisplay = ep.p.length > 50 ? ep.p.slice(0, 47) + '...' : ep.p;
      console.log(
        `${icon} ${ep.m.padEnd(5)} ${pathDisplay.padEnd(51)} ${statusStr.padEnd(30)} ${timeStr.padStart(7)}  ${sizeStr.padStart(10)}${items}`
      );
      if (res.error && res.status >= 400) {
        const errMsg = typeof res.error === 'string' ? res.error : JSON.stringify(res.error);
        console.log(`       -> ${errMsg.slice(0, 160)}`);
      }

      allResults.push({
        group: group.group,
        label: ep.label,
        method: ep.m,
        path: ep.p,
        status: res.status,
        statusText: res.statusText,
        elapsed: res.elapsed,
        size: res.size,
        error: res.error,
        items: items.replace(/[()]/g, '').trim(),
      });
    }
    console.log();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('='.repeat(W));
  console.log('  SUMMARY');
  console.log('='.repeat(W));

  const ok = allResults.filter(r => r.status >= 200 && r.status < 300);
  const clientErr = allResults.filter(r => r.status >= 400 && r.status < 500);
  const serverErr = allResults.filter(r => r.status >= 500 || r.status === 0);
  const total = allResults.length;

  const avgTime = Math.round(allResults.reduce((s, r) => s + r.elapsed, 0) / total);
  const maxTime = allResults.reduce((m, r) => r.elapsed > m.elapsed ? r : m, allResults[0]);
  const minTime = allResults.reduce((m, r) => r.elapsed < m.elapsed ? r : m, allResults[0]);
  const totalTransfer = allResults.reduce((s, r) => s + r.size, 0);

  console.log();
  console.log(`  Total endpoints tested:  ${total}`);
  console.log(`  [ OK ] Success (2xx):    ${ok.length}/${total}  (${Math.round(ok.length/total*100)}%)`);
  console.log(`  [WARN] Client err (4xx): ${clientErr.length}/${total}`);
  console.log(`  [ERR ] Server err (5xx): ${serverErr.length}/${total}`);
  console.log();
  console.log(`  Total data transferred:  ${formatSize(totalTransfer)}`);
  console.log(`  Avg response time:       ${avgTime}ms`);
  console.log(`  Fastest:                 ${minTime.elapsed}ms  ${minTime.method} ${minTime.path}`);
  console.log(`  Slowest:                 ${maxTime.elapsed}ms  ${maxTime.method} ${maxTime.path}`);

  if (clientErr.length > 0) {
    console.log('\n  --- CLIENT ERRORS (4xx) ---');
    for (const r of clientErr) {
      const errMsg = typeof r.error === 'string' ? r.error : JSON.stringify(r.error);
      console.log(`  ${r.status}  ${r.method.padEnd(5)} ${r.path}`);
      console.log(`        ${r.label}: ${errMsg.slice(0, 160)}`);
    }
  }

  if (serverErr.length > 0) {
    console.log('\n  --- SERVER ERRORS (5xx / Unreachable) ---');
    for (const r of serverErr) {
      const errMsg = typeof r.error === 'string' ? r.error : JSON.stringify(r.error);
      console.log(`  ${r.status}  ${r.method.padEnd(5)} ${r.path}`);
      console.log(`        ${r.label}: ${errMsg.slice(0, 160)}`);
    }
  }

  // Per-group summary
  console.log('\n  --- PER-GROUP STATUS ---');
  const groups = [...new Set(allResults.map(r => r.group))];
  for (const g of groups) {
    const gRes = allResults.filter(r => r.group === g);
    const gOk = gRes.filter(r => r.status >= 200 && r.status < 300).length;
    const gAvg = Math.round(gRes.reduce((s, r) => s + r.elapsed, 0) / gRes.length);
    const status = gOk === gRes.length ? '[ OK ]' : gOk > 0 ? '[PART]' : '[FAIL]';
    console.log(`  ${status} ${g.padEnd(30)} ${gOk}/${gRes.length}  avg ${gAvg}ms`);
  }

  console.log('\n' + '='.repeat(W));

  // ── JSON report ───────────────────────────────────────────────────────────
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    totalEndpoints: total,
    success: ok.length,
    clientErrors: clientErr.length,
    serverErrors: serverErr.length,
    successRate: `${Math.round(ok.length/total*100)}%`,
    avgResponseTimeMs: avgTime,
    fastestMs: minTime.elapsed,
    slowestMs: maxTime.elapsed,
    totalTransferBytes: totalTransfer,
    results: allResults,
  };

  const fs = await import('fs');
  const pathMod = await import('path');
  const outPath = pathMod.resolve(
    new URL('.', import.meta.url).pathname,
    '../audit-screenshots/api-health-report.json'
  );
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n  JSON report: ${outPath}`);
  console.log();

  if (serverErr.length > 0) process.exit(2);
  if (clientErr.length > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(3);
});
