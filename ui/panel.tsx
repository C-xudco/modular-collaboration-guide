"use client";
import React, { useEffect, useRef, useState } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { companionToolName, type BridgeTool } from "../lib/bridge-tools";
import { contextMemories, exportProfile, freshProfile, markdownProfile, suggestions, type Profile, type Memory, type MemoryValue, type Method, type MethodValue, type Task } from "../lib/domain";

import { collaborationMessage } from "../lib/message";

type Tab = "start" | "methods" | "memories" | "task";
const labels = { active: "已启用", candidate: "待确认", paused: "冲突暂停", disabled: "已停用" };
const kindLabels = { fact: "事实", preference: "偏好", temporary: "临时要求", inference: "AI 推测" };
const sourceLabels = { user_statement: "用户原话", manual: "本人确认", model_inference: "AI 推测", import: "历史导入" };
const emptyMemory = (): MemoryValue => ({ key: "", content: "", kind: "preference", scope: "global", source: { type: "manual", excerpt: "" }, status: "active", conflicts: [] });
const emptyMethod = (): MethodValue => ({ title: "", keywords: [], template: "我的目标：{goal}\n", reason: "", missing: [], source: { label: "我的方法" }, enabled: true });

export function Panel() {
  const [profile, setProfile] = useState<Profile | null>(null), [tab, setTab] = useState<Tab>("start");
  const [goal, setGoal] = useState(""), [draft, setDraft] = useState(""), [taskId, setTaskId] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(true), [query, setQuery] = useState(""), [composing, setComposing] = useState(false);
  const [ignored, setIgnored] = useState<string[]>([]), [notice, setNotice] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false), [login, setLogin] = useState(false);
  const [editMemory, setEditMemory] = useState<{ original?: Memory; value: MemoryValue; correction: boolean } | null>(null);
  const [editMethod, setEditMethod] = useState<{ original?: Method; value: MethodValue } | null>(null);
  const [deleteItem, setDeleteItem] = useState<{ type: "memory" | "method"; id: string; version: number } | null>(null);
  const [importText, setImportText] = useState(""), [importData, setImportData] = useState<ReturnType<typeof exportProfile> | null>(null);
  const [historyText, setHistoryText] = useState(""), [newTask, setNewTask] = useState("");
  const bridge = useRef<App | null>(null), live = useRef(true), current = useRef<Profile | null>(null), lock = useRef(false);
  const trustedTools = useRef<BridgeTool[]>([]);
  const receive = (p: Profile) => { if (live.current && (!current.current || p.revision >= current.current.revision)) { current.current = p; setProfile(p); } };
  const decode = (r: { isError?: boolean; content?: Array<{ type: string; text?: string }>; structuredContent?: unknown }) => {
    if (r.isError) throw new Error(r.content?.find(c => c.type === "text")?.text || "操作失败。");
    const data = r.structuredContent ?? JSON.parse(r.content?.find(c => c.type === "text")?.text || "{}");
    return data as { profile: Profile };
  };
  async function load() {
    try {
      if (bridge.current) receive(decode(await bridge.current.callServerTool({ name: companionToolName(trustedTools.current, "profile"), arguments: {} })).profile);
      else {
        const r = await fetch("/api/profile", { cache: "no-store" });
        if (r.status === 401) { setLogin(true); return; }
        const body = await r.json() as { error?: string; profile: Profile }; if (!r.ok) throw new Error(body.error); receive(body.profile);
      }
    } catch (e) { if (live.current) setError(e instanceof Error ? e.message : "读取失败。"); }
  }
  useEffect(() => {
    live.current = true;
    if (window.parent !== window) {
      const app = new App({ name: "modular-collaboration-guide", version: "1.0.0" }, { availableDisplayModes: ["fullscreen"] });
      bridge.current = app;
      app.ontoolresult = r => { try { const data = decode(r); if (data.profile) receive(data.profile); } catch (e) { setError(String(e)); } };
      app.onhostcontextchanged = ctx => { if (ctx.theme) document.documentElement.dataset.theme = ctx.theme; };
      app.connect().then(async () => {
        if (!live.current) return;
        setConnected(true);
        const discovered = await app.request({ method: "tools/list", params: {} }) as { tools: BridgeTool[] };
        trustedTools.current = discovered.tools;
        const ctx = app.getHostContext(); if (ctx?.theme) document.documentElement.dataset.theme = ctx.theme;
        if (ctx?.displayMode !== "fullscreen" && ctx?.availableDisplayModes?.includes("fullscreen")) await app.requestDisplayMode({ mode: "fullscreen" });
        if (!current.current) await load();
      }).catch(e => { if (live.current) setError("尚未连接 Codex：" + String(e)); });
      return () => { live.current = false; app.close(); bridge.current = null; };
    }
    load();
    return () => { live.current = false; };
  }, []);
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => { setQuery(goal); setIgnored([]); }, 250);
    return () => clearTimeout(timer);
  }, [goal, composing]);
  async function change(action: unknown): Promise<boolean> {
    if (!current.current || lock.current) return false;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const args = { revision: current.current.revision, action };
      if (bridge.current) receive(decode(await bridge.current.callServerTool({ name: companionToolName(trustedTools.current, "update"), arguments: args })).profile);
      else {
        const r = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
        const body = await r.json() as { error?: string; profile: Profile }; if (!r.ok) throw new Error(body.error); receive(body.profile);
      }
      setNotice("已保存到你的独立协作档案。"); return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败。"); await load(); return false;
    } finally { lock.current = false; setBusy(false); }
  }
  const p = profile ?? freshProfile(), task = p.tasks.find(t => t.id === taskId), memories = contextMemories(p, taskId || undefined);
  const recommended = showSuggestions ? suggestions(p, query, taskId || undefined).filter(s => !ignored.includes(s.id)) : [];
  function download(kind: "json" | "md") {
    const content = kind === "json" ? JSON.stringify(exportProfile(p), null, 2) : markdownProfile(p);
    const url = URL.createObjectURL(new Blob([content], { type: kind === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "我的协作档案." + kind; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function send(deeper = false, historical = false) {
    if (lock.current) return;
    const message = historical ? historyText : deeper ? goal : draft;
    if (!message.trim()) { setError("请先填写内容。"); return; }
    if (!bridge.current || !connected || !bridge.current.getHostCapabilities()?.message) {
      setError("当前页面没有 Codex 发送能力。请复制草稿到 Codex；档案管理仍可使用。"); return;
    }
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await bridge.current.sendMessage({ role: "user", content: [{ type: "text", text: collaborationMessage(p, taskId || undefined, message, goal || draft, deeper, historical) }] });
      if (result.isError) throw new Error("Codex 未接受发送，请保留草稿并重试。");
      setNotice("已发送至当前 Codex 对话。"); if (historical) setHistoryText("");
    } catch (e) { setError(e instanceof Error ? e.message : "发送失败。"); }
    finally { lock.current = false; setBusy(false); }
  }
  function saveTask(next: Partial<Task>) {
    if (task) void change({ action: "task.save", value: { ...task, ...next } });
  }
  return <div className="app">
    <header className="topbar"><div className="brand"><span className="brand-mark">↗</span><div><strong>协作指南</strong><span>让下一步更清楚</span></div></div><span className="connection"><i className={connected ? "on" : ""} />{connected ? "Codex 已连接" : "个人协作档案"}</span></header>
    <nav className="tabs" aria-label="功能导航">{([["start","开始协作"],["methods","方法库"],["memories","我的记忆"],["task","当前任务"]] as [Tab,string][]).map(([id,label]) => <button key={id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>{label}{id === "memories" && <small>{p.memories.length}</small>}</button>)}</nav>
    <div className="messages" aria-live="polite">{error && <div className="alert error">{error}<button onClick={() => setError("")} aria-label="关闭提示">×</button></div>}{notice && <div className="alert success">{notice}<button onClick={() => setNotice("")} aria-label="关闭提示">×</button></div>}</div>
    {login ? <div className="empty"><h2>登录后管理你的协作档案</h2><p>方法和记忆保存在你的独立空间。</p><a className="button primary" href="/signin-with-chatgpt?return_to=%2F" target="_top">使用 ChatGPT 登录</a></div>
    : !profile ? <div className="empty"><h2>{error ? "暂时无法读取档案" : "正在打开你的协作空间…"}</h2><button onClick={load}>重新读取</button></div>
    : <main>
      {tab === "start" && <>
        <div className="section-heading"><div><span className="eyebrow">从一个问题开始</span><h1>这次，你想完成什么？</h1><p>选一种适合你的方法，把目标变成可推进的对话。</p></div></div>
        <div className="workspace">
          <section className="composer card"><label htmlFor="goal">问题或目标</label><textarea id="goal" value={goal} maxLength={10000} onChange={e => setGoal(e.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} placeholder="例如：我想开发一个帮助团队整理资料的小工具…" />
            <div className="composer-meta"><span>推荐在本地匹配</span><label className="check"><input type="checkbox" checked={showSuggestions} onChange={e => setShowSuggestions(e.target.checked)} />显示建议</label></div>
            <div className="suggestions" aria-live="polite">{recommended.map((s,i) => <article className="suggestion" key={s.id}><div className="suggestion-title"><span className="step">0{i+1}</span><h3>{s.title}</h3><button className="icon" onClick={() => setIgnored(ids => [...ids,s.id])} aria-label={"忽略" + s.title}>×</button></div><p>{s.reason}</p><div className="missing">可以补充：{s.missing.join(" · ")}</div><details><summary>查看推荐提问</summary><pre>{s.prompt}</pre></details><div className="suggestion-footer"><span>{s.source.url ? <a href={s.source.url} target="_blank" rel="noreferrer">{s.source.label}</a> : s.source.label}</span><button onClick={() => { setDraft(s.prompt); setNotice("建议已放入草稿，可继续修改。"); }}>采用建议 ↗</button></div><div className="feedback"><button disabled={busy} aria-pressed={p.feedback[s.id] === "useful"} onClick={() => change({ action:"feedback",id:s.id,rating:"useful" })}>有用</button><button disabled={busy} aria-pressed={p.feedback[s.id] === "unhelpful"} onClick={() => change({ action:"feedback",id:s.id,rating:"unhelpful" })}>不适合</button></div></article>)}
              {!recommended.length && <div className="quiet">{!showSuggestions ? "建议已关闭，你可以直接编辑草稿。" : goal.trim() ? "暂时没有匹配的方法。可以换一种描述，或请求进一步建议。" : "输入目标后，这里会出现可选的提问和推进路径。"}</div>}</div>
          </section>
          <aside className="draft card"><div className="row"><h2>准备发送的内容</h2><span className="tag">可编辑</span></div><label className="sr-only" htmlFor="draft">发送草稿</label><textarea id="draft" value={draft} maxLength={20000} onChange={e => setDraft(e.target.value)} placeholder="采用建议，或直接在这里写下你的请求。" /><div className="row small"><span>已选背景：{memories.length} 条记忆</span><button className="link" onClick={() => setTab("task")}>管理背景</button></div><div className="stack"><button className="primary" disabled={busy || !draft.trim() || !connected} onClick={() => send()}>发送到当前 Codex 对话 ↗</button><button disabled={busy || !goal.trim()} onClick={async () => { if (connected) await send(true); else { try { await navigator.clipboard.writeText(collaborationMessage(p, taskId || undefined, goal, goal, true)); setNotice("深入建议请求已复制，请粘贴到自己的 Codex 对话中发送。"); } catch { setError("复制失败，请在 Codex 中主动请求深入建议。"); } } }}>{connected ? "进一步建议 · 使用当前模型" : "复制深入建议请求"}</button><button className="link" disabled={!draft} onClick={async () => { try { await navigator.clipboard.writeText(collaborationMessage(p, taskId || undefined, draft, goal)); setNotice("草稿和所选背景已复制，可粘贴到自己的 Codex。"); } catch { setError("复制未成功，请手动选择草稿复制。"); } }}>复制草稿</button></div><p className="footnote">采用建议不会发送。{connected ? "发送和深入分析由你主动触发。" : "本地网页请复制内容到自己的 Codex。"}</p></aside>
        </div>
      </>}
      {tab === "methods" && <><div className="section-heading"><div><span className="eyebrow">选择适合自己的做法</span><h1>你的方法工具箱</h1><p>方法是可修改的协作路径，不是对你的身份判断。</p></div><button className="primary" onClick={() => setEditMethod({ value: emptyMethod() })}>＋ 新建方法</button></div><div className="library">{p.methods.map(m => <article className="card method" key={m.id}><div className="row"><h2>{m.title}</h2><span className={"tag " + (m.enabled ? "green" : "")}>{m.enabled ? "启用" : "停用"}</span></div><p>{m.reason}</p><div className="chips">{m.keywords.map(k => <span key={k}>{k}</span>)}</div><details><summary>方法内容与来源</summary><pre>{m.template}</pre><p>{m.source.url ? <a href={m.source.url} target="_blank" rel="noreferrer">{m.source.label}</a> : m.source.label}</p></details><div className="actions"><button onClick={() => setEditMethod({ original:m,value:{ ...m } })}>编辑</button><button disabled={busy} onClick={() => change({ action:"method.save", id:m.id,version:m.version,value:{ ...m, enabled:!m.enabled } })}>{m.enabled ? "停用" : "启用"}</button><button onClick={() => setDeleteItem({ type:"method",id:m.id,version:m.version })}>删除</button></div>{m.history.length > 0 && <details><summary>历史版本</summary>{[...m.history].reverse().map(h => <div className="version" key={h.version}><span>v{h.version} · {h.value.title}</span><button disabled={busy} onClick={() => change({ action:"method.undo", id:m.id, version:m.version, targetVersion:h.version })}>恢复</button></div>)}</details>}</article>)}</div></>}
      {tab === "memories" && <><div className="section-heading"><div><span className="eyebrow">来源清楚，随时纠正</span><h1>我的协作记忆</h1><p>当前对话和主动导入的内容，在这里成为可管理的条目。</p></div><button className="primary" onClick={() => setEditMemory({ value:emptyMemory(),correction:false })}>＋ 添加记忆</button></div><div className="toolbar"><button onClick={() => download("json")}>导出 JSON</button><button onClick={() => download("md")}>导出 Markdown</button><button disabled={busy} onClick={load}>刷新档案</button><span className="small">档案 v{p.revision}</span></div>
        {!p.memories.length && <div className="empty card"><h2>从值得保留的一条信息开始</h2><p>例如你的表达偏好、长期目标，或当前项目的限制。启用配套 Skill 后，协作中的明确表达也会自动积累。</p></div>}
        <div className="memory-list">{p.memories.map(m => <article className="card memory" key={m.id}><div className="row"><span className="tag">{kindLabels[m.kind]} · {m.scope === "global" ? "长期" : "任务"}</span><span className={"tag " + (m.status === "active" ? "green" : m.status === "paused" ? "amber" : "")}>{labels[m.status]}</span></div><h2>{m.content}</h2><p className="small">主题：{m.key}{m.taskId ? " · " + (p.tasks.find(t => t.id === m.taskId)?.title ?? m.taskId) : ""}</p><blockquote>{m.source.excerpt}</blockquote><p className="small">来源：{sourceLabels[m.source.type]} · v{m.version} · {new Date(m.updatedAt).toLocaleString()}</p>{m.conflicts.length > 0 && <p className="conflict">存在相同主题的不同表述，请编辑并纠正后再使用。</p>}<div className="actions"><button onClick={() => setEditMemory({ original:m,value:{ ...m },correction:m.conflicts.length > 0 })}>{m.status === "candidate" ? "确认并编辑" : "编辑"}</button>{m.status !== "candidate" && <button disabled={busy || m.status === "paused"} onClick={() => change({ action:"memory.status",id:m.id,version:m.version,status:m.status === "active" ? "disabled" : "active" })}>{m.status === "active" ? "停用" : "启用"}</button>}<button onClick={() => setDeleteItem({ type:"memory",id:m.id,version:m.version })}>删除</button></div>{m.history.length > 0 && <details><summary>历史版本 · 可撤回</summary>{[...m.history].reverse().map(h => <div className="version" key={h.version}><span>v{h.version} · {h.value.content}</span><button disabled={busy} onClick={() => change({ action:"memory.undo",id:m.id,version:m.version,targetVersion:h.version })}>恢复</button></div>)}</details>}</article>)}</div>
        <section className="card import"><h2>主动导入历史内容</h2><p>结构化档案可以预览后导入；原始历史内容需主动交给 Codex 提炼。</p><label htmlFor="import">档案 JSON</label><textarea id="import" value={importText} maxLength={1000000} onChange={e => { setImportText(e.target.value); setImportData(null); }} placeholder="粘贴由本产品导出的 JSON 档案…" /><div className="actions"><button onClick={() => { try { const data = JSON.parse(importText); if (data.schemaVersion !== 1 || !Array.isArray(data.memories) || !Array.isArray(data.methods)) throw new Error("格式不匹配"); setImportData(data); } catch { setError("请提供有效的协作档案 JSON。"); } }}>预览导入</button>{importData && <button className="primary" disabled={busy} onClick={async () => { if (await change({ action:"import",data:importData,taskId:taskId || undefined })) { setImportData(null); setImportText(""); } }}>确认导入</button>}</div>{importData && <div className="import-preview"><p>{importData.methods.length} 个方法、{importData.memories.length} 条记忆。导入记忆默认待确认。</p><ul>{importData.memories.slice(0,10).map((m,i) => <li key={i}>{m.content}</li>)}</ul></div>}<label htmlFor="history">选定的历史对话</label><textarea id="history" value={historyText} maxLength={50000} onChange={e => setHistoryText(e.target.value)} placeholder="只粘贴你希望整理的历史内容，最好保留说话人标记。" /><button disabled={busy || !historyText.trim()} onClick={() => send(false,true)}>交给当前 Codex 提炼候选记忆</button></section></>}
      {tab === "task" && <><div className="section-heading"><div><span className="eyebrow">每次只带上适用背景</span><h1>当前任务的模块</h1><p>选用的方法与记忆会影响推荐，以及你主动发送时携带的背景。</p></div></div><section className="card task-settings"><label htmlFor="task-select">选择任务</label><select id="task-select" value={taskId} onChange={e => setTaskId(e.target.value)}><option value="">通用协作 · 使用长期记忆</option>{p.tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select><div className="row"><input aria-label="新任务名称" value={newTask} maxLength={200} onChange={e => setNewTask(e.target.value)} placeholder="新任务名称" /><button disabled={busy || !newTask.trim()} onClick={async () => { const id = crypto.randomUUID(); if (await change({ action:"task.save",value:{ id,title:newTask,methodIds:[],memoryIds:[],automaticMemories:true } })) { setTaskId(id); setNewTask(""); } }}>建立任务</button></div>{task && <><h2>方法选择</h2><p className="small">不勾选时使用所有启用方法；勾选后只使用选中的方法。</p>{p.methods.map(m => <label className="check select-item" key={m.id}><input type="checkbox" disabled={busy} checked={task.methodIds.includes(m.id)} onChange={e => saveTask({ methodIds:e.target.checked ? [...task.methodIds,m.id] : task.methodIds.filter(id => id !== m.id) })} />{m.title}{!m.enabled && "（已停用）"}</label>)}<h2>记忆选择</h2><label className="check"><input type="checkbox" disabled={busy} checked={task.automaticMemories} onChange={e => saveTask({ automaticMemories:e.target.checked })} />自动选择当前范围内的启用记忆</label>{!task.automaticMemories && p.memories.filter(m => m.scope === "global" || m.taskId === task.id).map(m => <label className="check select-item" key={m.id}><input type="checkbox" disabled={busy || m.status !== "active"} checked={task.memoryIds.includes(m.id)} onChange={e => saveTask({ memoryIds:e.target.checked ? [...task.memoryIds,m.id] : task.memoryIds.filter(id => id !== m.id) })} />{m.content} · {labels[m.status]}</label>)}</>}<h2>本次可使用的记忆</h2>{memories.length ? <ul>{memories.map(m => <li key={m.id}>{m.content}</li>)}</ul> : <p className="small">当前没有适用的启用记忆。</p>}</section></>}
    </main>}
    <footer className="footer">协作指南 v1.0 · 独立个人空间<button className="link" onClick={load} disabled={busy}>刷新</button></footer>
    {editMemory && <div className="overlay"><section className="modal" role="dialog" aria-modal="true" aria-label="编辑记忆"><h2>{editMemory.original ? "编辑与确认记忆" : "添加记忆"}</h2><label>主题标识<input value={editMemory.value.key} onChange={e => setEditMemory({ ...editMemory,value:{ ...editMemory.value,key:e.target.value } })} placeholder="例如：回答详细程度" /></label><label>内容<textarea value={editMemory.value.content} onChange={e => setEditMemory({ ...editMemory,value:{ ...editMemory.value,content:e.target.value } })} /></label><div className="row"><label>类型<select value={editMemory.value.kind} onChange={e => setEditMemory({ ...editMemory,value:{ ...editMemory.value,kind:e.target.value as MemoryValue["kind"] } })}>{Object.entries(kindLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label><label>范围<select value={editMemory.value.scope} onChange={e => setEditMemory({ ...editMemory,value:{ ...editMemory.value,scope:e.target.value as "global"|"task",taskId:taskId || undefined } })}><option value="global">长期</option><option value="task">当前任务</option></select></label></div><label>来源摘录<textarea value={editMemory.value.source.excerpt} onChange={e => setEditMemory({ ...editMemory,value:{ ...editMemory.value,source:{ ...editMemory.value.source,excerpt:e.target.value } } })} placeholder="记录依据；确认候选时补充本人确认的表述。" /></label>{editMemory.value.scope === "task" && <label>所属任务<select value={editMemory.value.taskId ?? taskId} onChange={e => setEditMemory({ ...editMemory,value:{ ...editMemory.value,taskId:e.target.value } })}><option value="">请选择</option>{p.tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>}<label className="check"><input type="checkbox" checked={editMemory.value.status === "active"} onChange={e => setEditMemory({ ...editMemory,value:{ ...editMemory.value,status:e.target.checked ? "active" : "disabled" } })} />确认内容并启用（AI 推测仍保持候选）</label>{editMemory.original?.conflicts.length ? <label className="check"><input type="checkbox" checked={editMemory.correction} onChange={e => setEditMemory({ ...editMemory,correction:e.target.checked })} />以此内容纠正冲突，停用冲突旧条目</label> : null}<div className="actions"><button onClick={() => setEditMemory(null)}>取消</button><button className="primary" disabled={busy} onClick={async () => { const v = { ...editMemory.value,taskId:editMemory.value.taskId || taskId,source:{ ...editMemory.value.source,type:editMemory.value.kind === "inference" ? "model_inference" : "manual" } }; const action = editMemory.original ? { action:"memory.edit",id:editMemory.original.id,version:editMemory.original.version,value:v,correction:editMemory.correction } : { action:"memory.save",value:v }; if (await change(action)) setEditMemory(null); }}>保存</button></div></section></div>}
    {editMethod && <div className="overlay"><section className="modal" role="dialog" aria-modal="true" aria-label="编辑方法"><h2>编辑方法模块</h2><label>名称<input value={editMethod.value.title} onChange={e => setEditMethod({ ...editMethod,value:{ ...editMethod.value,title:e.target.value } })} /></label><label>匹配词（用逗号分隔）<input value={editMethod.value.keywords.join(",")} onChange={e => setEditMethod({ ...editMethod,value:{ ...editMethod.value,keywords:e.target.value.split(/[,，]/) } })} /></label><label>提问模板（用 {"{goal}"} 表示目标）<textarea value={editMethod.value.template} onChange={e => setEditMethod({ ...editMethod,value:{ ...editMethod.value,template:e.target.value } })} /></label><label>适用理由<input value={editMethod.value.reason} onChange={e => setEditMethod({ ...editMethod,value:{ ...editMethod.value,reason:e.target.value } })} /></label><label>需要补充的信息（用逗号分隔）<input value={editMethod.value.missing.join(",")} onChange={e => setEditMethod({ ...editMethod,value:{ ...editMethod.value,missing:e.target.value.split(/[,，]/) } })} /></label><label>来源名称<input value={editMethod.value.source.label} onChange={e => setEditMethod({ ...editMethod,value:{ ...editMethod.value,source:{ ...editMethod.value.source,label:e.target.value } } })} /></label><label>公开来源链接（可选）<input type="url" value={editMethod.value.source.url ?? ""} onChange={e => setEditMethod({ ...editMethod,value:{ ...editMethod.value,source:{ ...editMethod.value.source,url:e.target.value || undefined } } })} /></label><div className="actions"><button onClick={() => setEditMethod(null)}>取消</button><button className="primary" disabled={busy} onClick={async () => { const value = { ...editMethod.value,keywords:editMethod.value.keywords.map(x => x.trim()).filter(Boolean),missing:editMethod.value.missing.map(x => x.trim()).filter(Boolean) }; if (await change({ action:"method.save",id:editMethod.original?.id,version:editMethod.original?.version,value })) setEditMethod(null); }}>保存方法</button></div></section></div>}
    {deleteItem && <div className="overlay"><section className="modal compact" role="dialog" aria-modal="true" aria-label="删除确认"><h2>删除这个条目？</h2><p>该条目及其版本记录将从独立档案删除。已经发出的聊天内容不会改变。</p><div className="actions"><button onClick={() => setDeleteItem(null)}>取消</button><button className="danger" disabled={busy} onClick={async () => { if (await change({ action:deleteItem.type + ".delete",id:deleteItem.id,version:deleteItem.version })) setDeleteItem(null); }}>删除条目</button></div></section></div>}
  </div>;
}
