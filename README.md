# 协作指南 · Codex 模块化助手

在自己的 Codex 中选择提问和推进方法，管理有来源、可编辑、可撤回的个人协作记忆。

**默认本地部署。无需连接作者的站点、申请作者账号或配置作者的 API 密钥。** 方法匹配和记忆管理不请求模型；聊天与主动深入建议使用安装者自己的 Codex 账号和额度。本地记忆在主动发送或工具读取时会成为自己 Codex 对话的背景，不意味着对话内容永远不离开电脑。

## 下载与安装（推荐）

需要 **Node.js 24 或更新版本**，以及自己的 Codex。下载 GitHub 的 Code → Download ZIP 并解压，或：

```sh
git clone https://github.com/C-xudco/modular-collaboration-guide.git
cd modular-collaboration-guide
node scripts/install-local.mjs --register
```

安装程序只复制本项目 Skill，并通过 Codex CLI 接入本地 MCP；不覆盖其他 Skill，不替换整个 Codex 配置。已有同名 Skill 时会停止，确认升级本项目后可加 `--update`，原 Skill 会先备份。

没有 Codex CLI 时运行 `node scripts/install-local.mjs`：它会安装 Skill，并显示基于本机真实路径的命令和配置片段。按 [中文本地部署说明](docs/本地部署.md) 在 Codex 设置里添加 stdio 服务。不要把网页地址当成云端 MCP 地址。

重新打开 Codex 对话后输入：

> 使用 $modular-collaboration-guide 帮我确定下一步，读取本地协作档案。

**保留解压后的项目目录**：Codex 需要从该目录启动服务。运行本地版不需要 npm install、pnpm、D1、Sites 登录或网络部署；`local/runtime.mjs` 是仓库提供的构建产物。

## 打开可编辑面板

```sh
node local/server.mjs --web
```

保持程序运行，浏览器打开 [http://127.0.0.1:4173/](http://127.0.0.1:4173/)。这里只监听本机回环地址；停止程序后网页会拒绝连接，重新运行即可。

网页支持方法、记忆、任务模块选择、版本恢复和 JSON / Markdown 导出导入。采用建议只更新草稿；「复制草稿」会携带所选背景，再由你粘贴到自己的 Codex 发送。「复制深入建议请求」也由你主动发送。网页不能直接发送到 Codex；兼容 MCP Apps 的宿主可通过工具返回的面板提供发送能力，是否显示内嵌界面取决于客户端支持。

## 插件方式（可选）

仓库还提供便携本地插件与 Codex 兼容配置，无需作者云端插件：

```sh
codex plugin marketplace add C-xudco/modular-collaboration-guide --ref main
```

在支持本地市场的桌面客户端选择「协作指南 · 本地版」。需要让 node 可从客户端环境找到。插件入口和手动安装提供相同的 Skill 与工具，**选择一种即可**，避免重复工具。[官方插件与本地市场文档](https://developers.openai.com/plugins/build/plugins)、[Codex MCP 配置](https://developers.openai.com/codex/mcp/)。

## 记忆如何工作

- 只处理启用助手后的协作内容，以及你主动导入的历史。
- 明确事实和偏好可以启用；临时要求限对应任务；AI 推测和导入条目保持候选。
- 每条记录有来源、范围、状态和版本。同一主题及范围发生冲突时暂停使用，明确纠正保留历史。
- 当前明确要求优先。停用和删除影响后续使用，不清除已发送聊天或账号原生记忆。
- 初始五个方法是明确标注的自建模板，可编辑和扩展。

安装不等于持续监听所有对话；需在任务中主动启用。服务不遍历账号聊天历史，不读取其他 Skill。冲突识别依据主题标识和范围，不是全文语义核验。JSON 迁移当前方法和记忆，不是包含全部历史、任务、反馈的完整数据库备份。

## 数据和费用

| 项目 | 存储或消耗位置 |
| --- | --- |
| 独立协作档案 | 安装者本机 SQLite，位于项目目录之外 |
| 方法匹配、编辑、撤回和导出 | 本地计算，无模型请求 |
| Codex 回答、记忆提炼、深入建议 | 安装者自己的 Codex 账号与用量 |
| 作者私有站点、D1、账户额度 | 默认本地版不连接、不使用 |

Windows 数据目录为 `%LOCALAPPDATA%/ModularCollaborationGuide`；macOS / Linux 为 XDG_DATA_HOME 下的 `modular-collaboration-guide`，未设置时使用 `~/.local/share/modular-collaboration-guide`，数据库文件名 `profile.sqlite`。用环境变量 `COLLABORATION_DATA_DIR` 可指定位置，MCP 和网页需用同一值才能共享。不同系统用户通常拥有不同路径；同一系统用户的进程共享档案。多份独立档案请指定不同目录。本地版没有远程网站的多用户登录隔离。

## 开发与验证

普通使用者不必安装开发依赖。修改代码时使用 Node 24 和 pnpm 11.25.0：

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm local:build
pnpm test:local
```

`local:build` 同步面板、共享协议构建产物和插件目录。本地测试覆盖真实 stdio 进程、持久化、独立档案、版本冲突、网页访问边界和安装备份。已在 Windows / Node 24 验证；macOS / Linux 尚未实机验收。本地 stdio 工具和浏览器面板已验收；Git 市场插件在真实桌面宿主中的安装及内嵌面板仍需实际安装验证。

结构：`skills/` 协作指令；`lib/` 共享规则和 MCP；`local/` 本地服务；`ui/` 面板；`plugins/` 分发包；`app/` 可选 Sites 云端实现；`docs/` 中文说明。

云端代码供开发者自行托管，公开分发不包含作者项目标识、登录凭据或个人档案。需建立自己的 Sites 项目、登录和 D1，不能以作者私有资源作为公共后端。本地安装不执行云端部署。

## 许可

原创代码采用 MIT；内置依赖和模板保留各自许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 vendor/、build/ 中的许可文件。
