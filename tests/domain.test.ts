import test from "node:test";
import assert from "node:assert/strict";
import { freshProfile, mutate, suggestions, contextMemories, exportProfile, type Profile } from "../lib/domain.ts";
import { companionToolName } from "../lib/bridge-tools.ts";
import { collaborationMessage } from "../lib/message.ts";
test("面板只使用宿主发现的可信工具名称，不猜测命名空间", () => {
  assert.equal(companionToolName([{name:"codex_collaboration_profile"}], "profile"), "codex_collaboration_profile");
  assert.equal(companionToolName([{name:"collaboration_update"}], "update"), "collaboration_update");
  assert.equal(companionToolName([{name:"opaque_name",_meta:{_codex_apps:{resource_uri:"/connector/target/codex_collaboration_profile"}}}], "profile"), "opaque_name");
  assert.throws(() => companionToolName([], "update"));
  assert.throws(() => companionToolName([{name:"a_collaboration_profile"},{name:"b_collaboration_profile"}], "profile"));
});
const value = (content = "先给结论", extra = {}) => ({ key:"回答方式",content,kind:"preference",scope:"global",status:"active",source:{ type:"user_statement",excerpt:content },...extra });
const save = (p: Profile, v: unknown) => mutate(p,{ action:"memory.save",value:v });

test("本地复制携带所选背景，停用条目不进入请求；明确要求保持原文", () => {
  let p=save(freshProfile(),value());
  const message=collaborationMessage(p,undefined,"这次请详细解释","我要开发项目");
  assert.ok(message.includes("这次请详细解释"));assert.ok(message.includes("先给结论"));
  const m=p.memories[0];p=mutate(p,{action:"memory.status",id:m.id,version:m.version,status:"disabled"});
  assert.equal(collaborationMessage(p,undefined,"这次请详细解释","").includes("先给结论"),false);
});
test("目标不同会匹配不同方法；无匹配时不制造建议", () => {
  const p = freshProfile();
  assert.equal(suggestions(p,"我要开发一个项目")[0].title,"把目标变成下一步");
  assert.equal(suggestions(p,"为什么水会蒸发")[0].title,"把问题问清楚");
  assert.equal(suggestions(p,"xyzzy").length,0);
  assert.ok(suggestions(p,"项目计划做方案选择测试").length <= 3);
  assert.equal(p.revision,0);
});
test("临时要求只能属于已存在的任务；不进入其他任务", () => {
  let p = mutate(freshProfile(),{ action:"task.save",value:{ id:"task-a",title:"项目A",methodIds:[],memoryIds:[],automaticMemories:true } });
  p = save(p,value("本次用表格",{ kind:"temporary",scope:"global",taskId:"task-a" }));
  assert.equal(p.memories[0].scope,"task"); assert.equal(contextMemories(p).length,0); assert.equal(contextMemories(p,"task-a").length,1);
  assert.throws(() => save(p,value("临时限制",{ kind:"temporary" })));
});
test("AI 推测与导入来源不自动启用", () => {
  const p = save(freshProfile(),value("可能偏好简短",{ source:{ type:"model_inference",excerpt:"推测" } }));
  assert.equal(p.memories[0].status,"candidate"); assert.equal(contextMemories(p).length,0);
  assert.throws(() => mutate(p,{ action:"memory.status",id:p.memories[0].id,version:1,status:"active" }));
});
test("不同主题内容冲突会暂停双方；明确纠正保留历史", () => {
  let p = save(freshProfile(),value());
  const old = p.memories[0].id;
  p = save(p,value("请详细解释"));
  assert.ok(p.memories.every(m => m.status === "paused")); assert.equal(contextMemories(p).length,0);
  const current = p.memories[1];
  p = mutate(p,{ action:"memory.edit",id:current.id,version:current.version,correction:true,value:value("请详细解释") });
  assert.equal(p.memories.find(m => m.id === old)?.status,"disabled");
  assert.equal(contextMemories(p).length,1); assert.ok(p.memories[1].history.length > 0);
});
test("重存相同信息不改变版本；停用与恢复版本影响未来背景", () => {
  let p = save(freshProfile(),value()); assert.strictEqual(save(p,value()),p);
  const m = p.memories[0];
  p = mutate(p,{ action:"memory.status",id:m.id,version:1,status:"disabled" });
  assert.equal(contextMemories(p).length,0);
  p = mutate(p,{ action:"memory.undo",id:m.id,version:2,targetVersion:1 });
  assert.equal(contextMemories(p).length,1);
});
test("过期条目版本不能覆盖新修改", () => {
  let p = save(freshProfile(),value()), id = p.memories[0].id;
  p = mutate(p,{ action:"memory.status",id,version:1,status:"disabled" });
  assert.throws(() => mutate(p,{ action:"memory.delete",id,version:1 }),/修改/);
});
test("导出再导入可迁移；导入重新生成标识并保持候选", () => {
  const p = save(freshProfile(),value());
  const next = mutate(freshProfile(),{ action:"import",data:exportProfile(p) });
  assert.equal(next.memories[0].status,"candidate"); assert.notEqual(next.memories[0].id,p.memories[0].id);
  assert.equal(next.memories[0].content,p.memories[0].content);
  assert.equal(next.methods.length,p.methods.length);
  const before = JSON.stringify(next);
  assert.throws(() => mutate(next,{ action:"import",data:{ schemaVersion:1,methods:[],memories:[{ content:"错误" }] } }));
  assert.equal(JSON.stringify(next),before);
});
test("正面反馈不能让无关目标获得推荐", () => {
  const p = mutate(freshProfile(),{ action:"feedback",id:"builtin-1",rating:"useful" });
  assert.equal(suggestions(p,"xyzzy").length,0);
});
test("用户选择限制方法和记忆；单次采用不改变用户偏好", () => {
  let p = save(freshProfile(),value());
  p = mutate(p,{ action:"task.save",value:{ id:"t",title:"仅验收",methodIds:["builtin-5"],memoryIds:[],automaticMemories:false } });
  assert.equal(contextMemories(p,"t").length,0); assert.equal(suggestions(p,"开发项目","t").length,0);
  assert.equal(suggestions(p,"检查结果","t")[0].id,"builtin-5");
  assert.equal(Object.keys(p.feedback).length,0);
});
test("删除清除条目及版本，且不进入未来导出", () => {
  let p = save(freshProfile(),value()); p = mutate(p,{ action:"memory.delete",id:p.memories[0].id,version:1 });
  assert.equal(exportProfile(p).memories.length,0);
});
