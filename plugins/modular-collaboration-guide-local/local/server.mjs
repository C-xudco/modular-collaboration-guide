import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { LocalStore } from './store.mjs';
import { handleMcp, panelHtml, DomainError } from './runtime.mjs';

export async function startWeb(store, port = 4173) {
  const token = randomBytes(32).toString('hex');
  let origin;
  const server = createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (req.headers.host !== new URL(origin).host) return send(403, { error: 'Host rejected' });
    if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: 'Origin rejected' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Cross-site request rejected' });
    if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'; connect-src 'self'", 'Set-Cookie': `collaboration_local=${token}; HttpOnly; SameSite=Strict; Path=/` });
      res.end(panelHtml); return;
    }
    if (req.url !== '/api/profile') return send(404, { error: 'Not found' });
    if (!req.headers.cookie?.split(';').some(c => c.trim() === `collaboration_local=${token}`)) return send(401, { error: '请先打开本地面板首页。' });
    try {
      if (req.method === 'GET') return send(200, { profile: await store.read('local') });
      if (req.method !== 'POST') return send(405, { error: 'Method not allowed' });
      if (req.headers.origin !== origin) return send(403, { error: 'Origin required' });
      const chunks = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 4400000) return send(413, { error: 'Request too large' });
        chunks.push(chunk);
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.length > 1100000) return send(413, { error: 'Request too large' });
      const args = JSON.parse(text);
      send(200, { profile: await store.change('local', args.revision, args.action) });
    } catch (error) {
      send(error instanceof DomainError && error.code === 'CONFLICT' ? 409 : 400, { error: error instanceof DomainError ? error.message : '请求无效或本地存储暂时不可用。' });
    }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { server, url: origin + '/' };
}

export function startStdio(store) {
  let pending = Promise.resolve();
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on('line', line => {
    pending = pending.then(async () => {
      let response;
      try {
        if (line.length > 1100000) throw new Error('Request too large');
        response = await handleMcp(new Request('http://localhost/mcp', { method: 'POST', body: line }), async () => ({ store, userId: 'local' }));
        if (response.status === 202) return;
        const json = await response.text();
        await new Promise((done, reject) => process.stdout.write(json + '\n', e => e ? reject(e) : done()));
      } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid request' } }) + '\n'); }
    });
  });
  lines.on('close', () => pending.finally(() => store.close()));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 24) throw new Error('请安装 Node.js 24 或更新的版本。');
  const args = process.argv.slice(2);
  const store = new LocalStore();
  if (args.includes('--web')) {
    const portIndex = args.indexOf('--port'), port = portIndex < 0 ? 4173 : Number(args[portIndex + 1]);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
    const web = await startWeb(store, port);
    console.error('协作指南本地面板：' + web.url + '\n数据：' + store.file + '\n停止后网页无法访问；Codex 工具由 Codex 自动启动。');
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => web.server.close(() => { store.close(); process.exit(0); }));
  } else {
    if (args.length) throw new Error('只支持 --web [--port PORT]；默认使用 stdio。');
    startStdio(store);
  }
}
