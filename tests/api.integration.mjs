import assert from "node:assert/strict";
const base = process.env.COLLABORATION_TEST_URL || "http://127.0.0.1:8787";
if (!["127.0.0.1","localhost"].includes(new URL(base).hostname)) throw new Error("Integration tests only run against a local preview.");
const userA = "test-a-" + crypto.randomUUID(), userB = "test-b-" + crypto.randomUUID();
const headers = id => ({ "content-type":"application/json", "oai-authenticated-user-id":id, "oai-authenticated-user-email":id + "@test.invalid" });
const read = async id => { const r = await fetch(base + "/api/profile",{ headers:headers(id) }); assert.equal(r.status,200); return (await r.json()).profile; };
const update = async (id,revision,action,extra = {}) => fetch(base + "/api/profile",{ method:"POST",headers:{ ...headers(id),...extra },body:JSON.stringify({ revision,action }) });
const rpc = async (method,params = {},id = userA) => { const r = await fetch(base + "/mcp",{ method:"POST",headers:headers(id),body:JSON.stringify({ jsonrpc:"2.0",id:1,method,params }) }); return { status:r.status,body:await r.json() }; };
assert.equal((await fetch(base + "/api/profile")).status,401);
assert.equal((await rpc("tools/call",{ name:"collaboration_profile" },"")).status,401);
let a = await read(userA), b = await read(userB);
assert.equal(a.revision,0); assert.equal(b.memories.length,0);
const memory = content => ({ key:"语气",content,kind:"preference",scope:"global",status:"active",source:{ type:"user_statement",excerpt:content } });
let r = await update(userA,0,{ action:"memory.save",value:memory("请用平实语言") });
assert.equal(r.status,200); a = (await r.json()).profile;
assert.equal((await read(userB)).memories.length,0);
assert.equal((await update(userA,a.revision,{ action:"memory.save",value:memory("旧窗口") },{ origin:"https://untrusted.invalid" })).status,403);
const id = a.memories[0].id, version = a.memories[0].version;
const concurrent = await Promise.all([
  update(userA,a.revision,{ action:"memory.status",id,version,status:"disabled" }),
  update(userA,a.revision,{ action:"memory.edit",id,version,value:memory("新的表述") }),
]);
assert.deepEqual(concurrent.map(r => r.status).sort(),[200,409]);
a = await read(userA);
assert.equal((await update(userB,0,{ action:"memory.delete",id,version:a.memories[0].version })).status,400);
assert.equal((await rpc("initialize",{ protocolVersion:"2025-11-25" })).body.result.protocolVersion,"2025-11-25");
const discovery = (await rpc("tools/list")).body.result.tools;
assert.equal(discovery.length,5); assert.equal(discovery.find(t => t.name === "collaboration_open")._meta.ui.resourceUri,"ui://collaboration-guide/panel");
const resource = (await rpc("resources/read",{ uri:"ui://collaboration-guide/panel" })).body.result.contents[0];
assert.equal(resource.mimeType,"text/html;profile=mcp-app"); assert.ok(resource.text.includes('<div id="root">')); assert.equal(resource._meta["openai/ui"].preferredDisplayMode,"fullscreen");
const exported = (await rpc("tools/call",{ name:"collaboration_export",arguments:{} })).body.result;
assert.ok(!exported.isError); assert.equal(exported.structuredContent.json.memories.length,1);
assert.equal((await rpc("tools/call",{ name:"collaboration_export",arguments:{} },userB)).body.result.structuredContent.json.memories.length,0);
const stale = (await rpc("tools/call",{ name:"collaboration_update",arguments:{ revision:0,action:{ action:"memory.save",value:memory("过期写入") } } })).body.result;
assert.equal(stale.isError,true); assert.equal(stale.structuredContent.code,"CONFLICT");
const deleted = await update(userA,a.revision,{ action:"memory.delete",id,version:a.memories[0].version });
assert.equal(deleted.status,200); assert.equal((await read(userA)).memories.length,0);
console.log("PASS: authenticated persistence, two-user isolation, concurrent revisions, request origin, MCP discovery/resources/tools, exports and deletion.");
