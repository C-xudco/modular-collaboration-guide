export type Scope = "global" | "task";
export type MemoryKind = "fact" | "preference" | "temporary" | "inference";
export type MemoryStatus = "active" | "candidate" | "paused" | "disabled";
export type Source = { type: "user_statement" | "model_inference" | "import" | "manual"; excerpt: string; threadId?: string };
export type MemoryValue = { key: string; content: string; kind: MemoryKind; scope: Scope; taskId?: string; source: Source; status: MemoryStatus; conflicts: string[] };
export type Memory = MemoryValue & { id: string; version: number; updatedAt: string; history: Array<{ version: number; at: string; value: MemoryValue }> };
export type MethodValue = { title: string; keywords: string[]; template: string; reason: string; missing: string[]; source: { label: string; url?: string }; enabled: boolean };
export type Method = MethodValue & { id: string; version: number; history: Array<{ version: number; value: MethodValue }> };
export type Task = { id: string; title: string; methodIds: string[]; memoryIds: string[]; automaticMemories: boolean };
export type Profile = { schemaVersion: 1; revision: number; memories: Memory[]; methods: Method[]; tasks: Task[]; feedback: Record<string, "useful" | "unhelpful"> };
export type Suggestion = { id: string; title: string; prompt: string; reason: string; missing: string[]; source: Method["source"]; score: number };
export class DomainError extends Error { constructor(public code: string, message: string) { super(message); } }
export const builtins: MethodValue[] = [
  { title: "把问题问清楚", keywords: ["问题", "为什么", "怎么办", "如何", "怎么", "理解", "解释", "区别", "question", "explain"], template: "我想弄清楚：{goal}\n请先指出问题中的歧义和需要补充的信息，再根据已有信息解释。区分事实、假设和不确定之处。", reason: "先减少歧义，避免 AI 回答了另一个问题。", missing: ["具体情境", "已经知道或尝试过什么", "希望获得的答案类型"], source: { label: "自建模板 · 问题澄清" }, enabled: true },
  { title: "补齐必要背景", keywords: ["写", "周报", "文案", "报告", "材料", "邮件", "背景", "总结", "内容", "draft", "write"], template: "任务：{goal}\n请先确认受众、用途、已有材料及限制。信息不足时只问会改变结果的关键问题；不替我编造经历或事实。", reason: "让输出适合实际受众和用途，减少反复改写。", missing: ["受众与用途", "可依据的材料", "篇幅与格式"], source: { label: "自建模板 · 背景与输出约束" }, enabled: true },
  { title: "把目标变成下一步", keywords: ["目标", "项目", "开发", "做", "建立", "计划", "实现", "学习", "开始", "产品", "build", "project", "plan"], template: "我的目标是：{goal}\n先帮我明确成功标准、当前条件和主要限制，再拆成可执行的阶段。优先给出最小验证步骤，并说明每一步的交付物。", reason: "先找到可验证的起点，再决定后续投入。", missing: ["成功标准", "时间与资源", "目前进展"], source: { label: "自建模板 · 目标拆解" }, enabled: true },
  { title: "比较可选路径", keywords: ["选择", "比较", "方案", "技术", "成本", "哪个好", "推荐", "还是", "取舍", "compare", "option"], template: "我要解决：{goal}\n请按我的目标和限制比较可选路径，说明适用条件、成本、风险与证据。给出推荐理由和哪些新信息会改变推荐。", reason: "把选择依据展开，方便自己决定而非盲目接受。", missing: ["候选方案", "最重要的比较维度", "不可接受的成本或限制"], source: { label: "自建模板 · 方案比较" }, enabled: true },
  { title: "检查结果是否达标", keywords: ["检查", "验证", "验收", "测试", "结果", "错误", "准确", "完成", "评估", "test", "review"], template: "请检查：{goal}\n先列出验收标准，再用例子或证据逐项验证。明确已验证、未验证和失败的部分，并给出下一步修正建议。", reason: "用可检查的标准判断结果，而不是只看表达是否流畅。", missing: ["待检查结果", "验收标准", "可复现的输入或证据"], source: { label: "自建模板 · 验收检查" }, enabled: true },
];
export function freshProfile(): Profile {
  return { schemaVersion: 1, revision: 0, memories: [], methods: builtins.map((m, i) => ({ ...structuredClone(m), id: "builtin-" + (i + 1), version: 1, history: [] })), tasks: [], feedback: {} };
}
function obj(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DomainError("INVALID", "需要对象格式的数据。");
  return input as Record<string, unknown>;
}
function str(input: unknown, label: string, max = 4000): string {
  if (typeof input !== "string" || !input.trim() || input.length > max) throw new DomainError("INVALID", label + "为空或超过长度限制。");
  return input.trim();
}
function choice<T extends string>(input: unknown, options: T[], label: string): T {
  if (!options.includes(input as T)) throw new DomainError("INVALID", label + "无效。");
  return input as T;
}
function texts(input: unknown, max = 30): string[] {
  if (!Array.isArray(input) || input.length > max) throw new DomainError("INVALID", "列表格式或数量无效。");
  return [...new Set(input.map(x => str(x, "列表内容", 200)))];
}
function integer(input: unknown): number {
  if (!Number.isSafeInteger(input) || (input as number) < 1) throw new DomainError("INVALID", "版本号无效。");
  return input as number;
}
function source(input: unknown): Source {
  const s = obj(input);
  return { type: choice(s.type, ["user_statement", "model_inference", "import", "manual"], "来源"),
    excerpt: str(s.excerpt, "来源摘录", 4000), ...(s.threadId ? { threadId: str(s.threadId, "对话标识", 200) } : {}) };
}
function memoryValue(input: unknown): MemoryValue {
  const m = obj(input);
  const kind = choice(m.kind, ["fact", "preference", "temporary", "inference"], "记忆类型");
  const origin = source(m.source);
  const scope = kind === "temporary" ? "task" : choice(m.scope, ["global", "task"], "范围");
  const status = choice(m.status ?? "active", ["active", "candidate", "paused", "disabled"], "状态");
  return { key: str(m.key, "主题标识", 200), content: str(m.content, "记忆内容"), kind, scope,
    ...(scope === "task" ? { taskId: str(m.taskId, "任务标识", 200) } : {}),
    source: origin, status: kind === "inference" || origin.type === "model_inference" || origin.type === "import" ? (status === "disabled" ? status : "candidate") : status,
    conflicts: [] };
}
function methodValue(input: unknown): MethodValue {
  const m = obj(input), s = obj(m.source);
  let url: string | undefined;
  if (s.url) {
    url = str(s.url, "来源链接", 2000);
    if (!/^https:\/\/[^\s]+$/i.test(url)) throw new DomainError("INVALID", "来源链接必须是 HTTPS。");
  }
  if (typeof m.enabled !== "boolean") throw new DomainError("INVALID", "启用状态无效。");
  return { title: str(m.title, "方法名称", 100), keywords: texts(m.keywords), template: str(m.template, "方法模板", 10000),
    reason: str(m.reason, "适用理由", 1000), missing: texts(m.missing, 10),
    source: { label: str(s.label, "方法来源", 200), ...(url ? { url } : {}) }, enabled: m.enabled };
}
function memorySnapshot(m: Memory): MemoryValue {
  const { id: _id, version: _v, updatedAt: _u, history: _h, ...v } = m; return structuredClone(v);
}
function methodSnapshot(m: Method): MethodValue {
  const { id: _id, version: _v, history: _h, ...v } = m; return structuredClone(v);
}
function rememberVersion(m: Memory): void {
  m.history.push({ version: m.version, at: m.updatedAt, value: memorySnapshot(m) }); m.version++; m.updatedAt = new Date().toISOString();
}
function conflicts(p: Profile, m: Memory): void {
  const others = p.memories.filter(x => x.id !== m.id && x.status !== "disabled" && x.key === m.key && x.scope === m.scope && x.taskId === m.taskId && x.content !== m.content && x.kind !== "inference" && m.kind !== "inference" && x.source.type !== "model_inference" && m.source.type !== "model_inference" && x.status !== "candidate" && m.status !== "candidate");
  if (!others.length) return;
  for (const other of others) { rememberVersion(other); other.status = "paused"; other.conflicts = [...new Set([...other.conflicts, m.id])]; }
  m.status = "paused"; m.conflicts = others.map(x => x.id);
}
export function contextMemories(p: Profile, taskId?: string): Memory[] {
  const task = p.tasks.find(t => t.id === taskId);
  return p.memories.filter(m => m.status === "active" && !m.conflicts.length && (m.scope === "global" || m.taskId === taskId) && (task?.automaticMemories !== false || task.memoryIds.includes(m.id)));
}
export function suggestions(p: Profile, goal: string, taskId?: string): Suggestion[] {
  if (goal.trim().length < 2) return [];
  const q = goal.toLowerCase(), task = p.tasks.find(t => t.id === taskId), memory = contextMemories(p, taskId);
  return p.methods.filter(m => m.enabled && (!task?.methodIds.length || task.methodIds.includes(m.id))).map(m => {
    const hits = m.keywords.filter(k => q.includes(k.toLowerCase())).length;
    const score = hits ? hits * 3 + (p.feedback[m.id] === "useful" ? 1 : p.feedback[m.id] === "unhelpful" ? -2 : 0) : 0;
    return { id: m.id, title: m.title, prompt: m.template.replaceAll("{goal}", goal.trim()),
      reason: m.reason + (memory.length ? " · 已匹配 " + memory.length + " 条适用记忆，发送时可携带。" : ""), missing: m.missing, source: m.source, score };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3);
}
export function mutate(original: Profile, input: unknown): Profile {
  const p = structuredClone(original), a = obj(input), action = str(a.action, "操作", 80);
  const findMemory = () => { const m = p.memories.find(x => x.id === a.id); if (!m) throw new DomainError("NOT_FOUND", "记忆不存在。"); if (m.version !== integer(a.version)) throw new DomainError("CONFLICT", "记忆已被其他窗口修改，请刷新。"); return m; };
  const findMethod = () => { const m = p.methods.find(x => x.id === a.id); if (!m) throw new DomainError("NOT_FOUND", "方法不存在。"); if (m.version !== integer(a.version)) throw new DomainError("CONFLICT", "方法已被修改，请刷新。"); return m; };
  switch (action) {
    case "memory.save": {
      const v = memoryValue(a.value);
      if (v.scope === "task" && !p.tasks.some(t => t.id === v.taskId)) throw new DomainError("INVALID", "请先创建对应任务。");
      if (p.memories.some(m => m.key === v.key && m.content === v.content && m.scope === v.scope && m.taskId === v.taskId)) return original;
      const m: Memory = { ...v, id: crypto.randomUUID(), version: 1, updatedAt: new Date().toISOString(), history: [] };
      p.memories.push(m); conflicts(p, m); break;
    }
    case "memory.edit": {
      const m = findMemory(), v = memoryValue(a.value);
      if (v.scope === "task" && !p.tasks.some(t => t.id === v.taskId)) throw new DomainError("INVALID", "任务不存在。");
      if (m.conflicts.length && a.correction !== true) throw new DomainError("INVALID", "请明确选择纠正冲突，或保持暂停。");
      rememberVersion(m);
      if (a.correction === true) {
        for (const other of p.memories.filter(x => m.conflicts.includes(x.id))) {
          rememberVersion(other); other.status = "disabled"; other.conflicts = other.conflicts.filter(id => id !== m.id);
        }
      }
      Object.assign(m, v); conflicts(p, m); break;
    }
    case "memory.status": {
      const m = findMemory(), status = choice(a.status, ["active", "candidate", "paused", "disabled"], "状态");
      if (status === "active" && m.conflicts.length) throw new DomainError("INVALID", "请先纠正冲突。");
      if (status === "active" && (m.kind === "inference" || m.source.type === "model_inference" || m.source.type === "import")) throw new DomainError("INVALID", "候选内容须编辑为本人确认的事实或偏好后启用。");
      rememberVersion(m); m.status = status; if (status === "active") conflicts(p, m); break;
    }
    case "memory.undo": {
      const m = findMemory(), target = m.history.find(v => v.version === integer(a.targetVersion));
      if (!target) throw new DomainError("NOT_FOUND", "没有这个历史版本。");
      const v = structuredClone(target.value); rememberVersion(m); Object.assign(m, v);
      // Restoring one record cannot restore another record's state. Revalidate all links.
      m.conflicts = m.conflicts.filter(id => p.memories.some(x => x.id === id && x.status !== "disabled"));
      if (m.conflicts.length) m.status = "paused";
      if (m.kind === "inference" || m.source.type === "model_inference" || m.source.type === "import") m.status = "candidate";
      conflicts(p, m); break;
    }
    case "memory.delete": {
      const m = findMemory(); p.memories = p.memories.filter(x => x.id !== m.id);
      for (const other of p.memories.filter(x => x.conflicts.includes(m.id))) { rememberVersion(other); other.conflicts = other.conflicts.filter(id => id !== m.id); }
      p.tasks.forEach(t => t.memoryIds = t.memoryIds.filter(id => id !== m.id)); break;
    }
    case "method.save": {
      const v = methodValue(a.value);
      if (a.id) { const m = findMethod(); m.history.push({ version: m.version, value: methodSnapshot(m) }); Object.assign(m, v); m.version++; }
      else p.methods.push({ ...v, id: crypto.randomUUID(), version: 1, history: [] });
      break;
    }
    case "method.undo": {
      const m = findMethod(), target = m.history.find(v => v.version === integer(a.targetVersion));
      if (!target) throw new DomainError("NOT_FOUND", "没有这个历史版本。");
      const v = structuredClone(target.value); m.history.push({ version: m.version, value: methodSnapshot(m) }); Object.assign(m, v); m.version++; break;
    }
    case "method.delete": {
      const m = findMethod(); p.methods = p.methods.filter(x => x.id !== m.id); delete p.feedback[m.id];
      p.tasks.forEach(t => t.methodIds = t.methodIds.filter(id => id !== m.id)); break;
    }
    case "feedback": {
      const id = str(a.id, "方法标识", 200);
      if (!p.methods.some(m => m.id === id)) throw new DomainError("NOT_FOUND", "方法不存在。");
      p.feedback[id] = choice(a.rating, ["useful", "unhelpful"], "反馈"); break;
    }
    case "task.save": {
      const t = obj(a.value), id = t.id ? str(t.id, "任务标识", 200) : crypto.randomUUID();
      const methodIds = texts(t.methodIds, 100), memoryIds = texts(t.memoryIds, 1000);
      if (methodIds.some(id => !p.methods.some(m => m.id === id)) || memoryIds.some(id => !p.memories.some(m => m.id === id))) throw new DomainError("INVALID", "选择的模块不存在。");
      if (typeof t.automaticMemories !== "boolean") throw new DomainError("INVALID", "记忆选择模式无效。");
      const task = { id, title: str(t.title, "任务名称", 200), methodIds, memoryIds, automaticMemories: t.automaticMemories };
      const i = p.tasks.findIndex(x => x.id === id); if (i >= 0) p.tasks[i] = task; else p.tasks.push(task); break;
    }
    case "import": {
      const data = obj(a.data);
      if (data.schemaVersion !== 1 || !Array.isArray(data.memories) || !Array.isArray(data.methods) || data.memories.length > 100 || data.methods.length > 100) throw new DomainError("INVALID", "导入格式无效，单次最多各 100 条。");
      for (const item of data.methods) {
        const v = methodValue(item);
        if (!p.methods.some(m => m.title === v.title && m.template === v.template)) p.methods.push({ ...v, id: crypto.randomUUID(), version: 1, history: [] });
      }
      for (const item of data.memories) {
        const raw = obj(item), importedSource = obj(raw.source);
        // Historical task IDs are not portable; attach task records to the current task.
        const v = memoryValue({ ...raw, ...(raw.scope === "task" || raw.kind === "temporary" ? { taskId: a.taskId } : {}), source: { type: "import", excerpt: str(importedSource.excerpt, "来源摘录"), threadId: importedSource.threadId }, status: "candidate" });
        if (v.scope === "task" && !p.tasks.some(t => t.id === v.taskId)) throw new DomainError("INVALID", "含任务记忆，请先选择当前任务。");
        if (!p.memories.some(m => m.key === v.key && m.content === v.content && m.scope === v.scope && m.taskId === v.taskId)) p.memories.push({ ...v, id: crypto.randomUUID(), version: 1, updatedAt: new Date().toISOString(), history: [] });
      }
      break;
    }
    default: throw new DomainError("INVALID", "未知操作。");
  }
  if (p.memories.length > 1000 || p.methods.length > 200 || p.tasks.length > 200 || JSON.stringify(p).length > 1000000) throw new DomainError("LIMIT", "档案达到首版容量限制，请导出并整理。");
  p.revision++; return p;
}
export function exportProfile(p: Profile) {
  return { schemaVersion: 1, exportedAt: new Date().toISOString(),
    methods: p.methods.map(methodSnapshot), memories: p.memories.map(memorySnapshot) };
}
export function markdownProfile(p: Profile): string {
  const safe = (v: string) => v.replaceAll("\r", "").replaceAll("\n", "\n    ");
  return "# 我的协作档案\n\n导出时间：" + new Date().toISOString() + "\n\n## 方法模块\n\n" +
    p.methods.map(m => "### " + safe(m.title) + "\n\n状态：" + (m.enabled ? "启用" : "停用") + "\n\n" + safe(m.template) + "\n\n来源：" + safe(m.source.label) + (m.source.url ? " " + m.source.url : "")).join("\n\n") +
    "\n\n## 个人记忆\n\n" + p.memories.map(m => "- [" + m.status + "] " + safe(m.content) + "\n  范围：" + m.scope + (m.taskId ? " / " + m.taskId : "") + "；主题：" + safe(m.key) + "\n  来源：" + safe(m.source.excerpt)).join("\n\n");
}
