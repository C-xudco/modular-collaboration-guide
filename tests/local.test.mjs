import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { get as httpGet } from 'node:http';
import { LocalStore } from '../local/store.mjs';
import { startWeb } from '../local/server.mjs';
const value = { key:'合成验收',content:'仅测试本地存储',kind:'preference',scope:'global',status:'active',source:{type:'user_statement',excerpt:'仅测试本地存储'} };

test('独立数据库、跨窗口版本检查和重启持久化', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'collaboration-store-'));
  const a = new LocalStore(join(dir, 'a.sqlite')), b = new LocalStore(join(dir, 'a.sqlite')), separate = new LocalStore(join(dir, 'b.sqlite'));
  try {
    const results = await Promise.allSettled([a.change('local',0,{action:'memory.save',value}),b.change('local',0,{action:'memory.save',value:{...value,key:'another'}})]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length,1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code,'CONFLICT');
    assert.equal((await separate.read()).memories.length,0);
    const p = await b.read(); const m = p.memories[0];
    const edited = await b.change('local',p.revision,{action:'memory.edit',id:m.id,version:m.version,value:{...value,content:'测试修改'}});
    const undo = await a.change('local',edited.revision,{action:'memory.undo',id:m.id,version:2,targetVersion:1});
    assert.equal(undo.memories[0].content,value.content);
    a.close();
    const restarted = new LocalStore(join(dir,'a.sqlite'));
    assert.equal((await restarted.read()).revision,3); restarted.close();
  } finally { b.close(); separate.close(); }
});

test('本地网页须有会话 Cookie、同源写入并抵御跨站和伪造 Host', async () => {
  const dir = await mkdtemp(join(tmpdir(),'collaboration-web-')), store = new LocalStore(join(dir,'profile.sqlite'));
  const {server,url} = await startWeb(store,0);
  try {
    const page = await fetch(url), cookie = page.headers.get('set-cookie').split(';')[0];
    assert.equal(page.status,200); assert.match(await page.text(),/id="root"/);
    assert.equal((await fetch(url+'api/profile')).status,401);
    const forged = await new Promise((done,reject) => httpGet(url+'api/profile',{headers:{cookie,Host:'attacker.example'}}, r => { r.resume();done(r.statusCode); }).on('error',reject));
    assert.equal(forged,403);
    assert.equal((await fetch(url+'api/profile',{headers:{cookie,Origin:'https://attacker.example'}})).status,403);
    const body=JSON.stringify({revision:0,action:{action:'memory.save',value}});
    assert.equal((await fetch(url+'api/profile',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body})).status,403);
    const response=await fetch(url+'api/profile',{method:'POST',headers:{cookie,Origin:url.slice(0,-1),'Content-Type':'application/json'},body});
    assert.equal(response.status,200);assert.equal((await response.json()).profile.memories[0].content,value.content);
    const stale=await fetch(url+'api/profile',{method:'POST',headers:{cookie,Origin:url.slice(0,-1)},body});assert.equal(stale.status,409);
  } finally { await new Promise(done=>server.close(done));store.close(); }
});

test('真实 stdio 进程完成 MCP 发现、写入、导出；stdout 只包含协议', async () => {
  const dir = await mkdtemp(join(tmpdir(),'collaboration-mcp-'));
  const child=spawn(process.execPath,[resolve('local/server.mjs')],{env:{...process.env,COLLABORATION_DATA_DIR:dir},windowsHide:true});
  let id=0; const pending=new Map();let logs='';child.stderr.on('data',c=>logs+=c);
  createInterface({input:child.stdout}).on('line',line=>{const rpc=JSON.parse(line);const p=pending.get(rpc.id);assert.ok(p,'Unexpected protocol output');clearTimeout(p.timer);pending.delete(rpc.id);p.resolve(rpc);});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;const timer=setTimeout(()=>reject(Error('MCP timeout: '+logs)),10000);pending.set(next,{resolve,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:next,method,params})+'\n');});
  try {
    assert.equal((await call('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}})).result.capabilities.tools.constructor,Object);
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    assert.equal((await call('tools/list')).result.tools.length,5);
    const resource=await call('resources/read',{uri:'ui://collaboration-guide/panel'});assert.match(resource.result.contents[0].text,/id="root"/);
    const saved=await call('tools/call',{name:'collaboration_update',arguments:{revision:0,action:{action:'memory.save',value}}});assert.equal(saved.result.structuredContent.profile.revision,1);
    const exported=await call('tools/call',{name:'collaboration_export',arguments:{}});assert.equal(exported.result.structuredContent.json.memories.length,1);
    const stale=await call('tools/call',{name:'collaboration_update',arguments:{revision:0,action:{action:'memory.save',value}}});assert.equal(stale.result.isError,true);
  } finally { child.stdin.end(); await new Promise(done=>child.once('exit',done)); }
});

test('安装程序只安装自身 Skill，拒绝静默覆盖并支持备份更新', async () => {
  const dir=await mkdtemp(join(tmpdir(),'collaboration-install-'));
  const install=(extra=[])=>spawnSync(process.execPath,['scripts/install-local.mjs','--home',dir,...extra],{encoding:'utf8',windowsHide:true});
  assert.equal(install().status,0);
  assert.match(await readFile(join(dir,'skills/modular-collaboration-guide/SKILL.md'),'utf8'),/name: modular-collaboration-guide/);
  assert.notEqual(install().status,0);
  assert.equal(install(['--update']).status,0);
  assert.equal((await readdir(join(dir,'skill-backups'))).length,1);
});
