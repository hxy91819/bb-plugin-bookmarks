# 验证记录（2026-10-15）

隔离源码宿主：`feature/thread-message-navigation`，源码 commit `f7b53a6004`。
未修改 BB 仓库受跟踪文件，未在生产实例安装插件或写书签数据。
使用 verify-bb 流程；源码清单检查报 `Unmapped CLI family: browser`，属于现有清单漂移，未修改宿主清单。

## 自动化

- `npm run typecheck`：通过。
- `npm test`：3 项通过。公开 SDK harness 驱动选区/整条消息 action；真实 SQLite 覆盖 migration 重载、精确文字、来源、备注、搜索字面通配符、项目筛选、分页、分组、删除及 CLI；公开依赖扫描通过。
- `npm run build`：通过，生成 app/server bundle 与 metadata。

## 实测

证据目录：`/tmp/bb-bookmarks-verification-_paa6pz0`。截图经人工读取检查。

| 验收 | 结果 | 证据 |
| --- | --- | --- |
| 用户消息按钮加书签、成功 toast | 通过 | `01-message-bookmarked.png`、`cli-list-initial.json` |
| assistant 选区保存精确文字 | 自动化通过，浏览器阻塞 | `tests.log`；见下方 provider 阻塞 |
| SQLite 持久化及 migration | 通过 | 自动化真实 SQLite；dev `plugin reload bookmarks` 后文字、备注仍在 |
| 侧栏底部最近与搜索 | 通过 | `02-recent.png`；全页搜索见 `04-note-search.png` |
| 全页按项目分组，显示标签、文字、备注、时间 | 通过 | `03-project-groups.png`，A/B 两个项目 |
| 编辑备注、搜索备注、复制文字 | 通过 | `04-note-search.png`、`cli-show.json`；浏览器 clipboard readText 与原文相等 |
| 点击跳回原会话、原消息 | 通过（用户消息） | 路由为原 thread 的 `#msg=1`，目标 user-seed:1 可见；`05-message-navigation.png` |
| 长内容滚动回原消息 | 通过（用户消息） | 添加 120 段长用户输入、展开后滚动；目标 top 从 -3330px 回到 64px；`02-recent.png`、`08-after-scroll-jump.png`、`scroll-result.json` |
| CLI list、按项目筛选、show、rm、--json | 通过 | `cli-list-grouped.json`、`cli-project.json`、`cli-show.json`、`cli-rm.json`、`cli-after-rm.json` |
| UI 删除与列表更新 | 通过 | `06-deleted.png`、`cli-after-ui-delete.json` |
| 旧宿主忽略消息定位选项仍打开会话 | 源码兼容，未运行旧宿主 | 调用公开 toThread，并传结构化可忽略选项；同步拒绝时回退普通 toThread |

## Provider 阻塞

按要求只尝试 `acp-devin`，SWE-2 模型（catalog ID `swe-2-medium`），CLI 显式请求 `--reasoning-level low`。宿主警告：

> Model "swe-2-medium" has no low reasoning variant; launching it at its default effort.

随后 Devin 返回周额度耗尽，未生成 assistant 回复。没有改用 Codex 或其他 provider，也没有伪造 assistant 回复。选择菜单的真实浏览器输入因此未完成；滚动定位另用真实长用户输入完成验证。

## 自行引入的决定

- 保留添加时的项目名称和会话标题快照；重复添加创建独立书签。
- 最近列表 10 条；全页每页 100 条；CLI 默认 100 条，支持 limit/offset（上限 200），输出过大时明确要求缩小分页。
- 搜索文字、备注、会话标题、项目名称，通配符视为普通文字；每条文字上限 200000 字符、备注上限 20000 字符。
- 使用插件自带 SVG 图标，避免宿主内置图标名差异。
- 固定公开 npm SDK 0.6.37；传递源码宿主新消息定位选项，不导入 BB 内部模块、不拼路由 hash。

## 独立审查

通过 autoreview + bb-model-routing 派发 `thr_4e4b7hhn6e`（Pi，cliproxy/gemini-3.8-flash-high，high），审查完整 staged tree。发现一项 P1：直接调用 navigator.clipboard 无宿主回退。已核实、接受并改用公开 `experimental_copyToClipboard`；返回 false 时显示失败提示。

浏览器负向对照：原生 writeText 抛 NotAllowedError；同一权限状态下点击插件复制按钮，SDK 回退复制成功，readText 与书签原文一致（`09-sdk-clipboard-fallback.png`、`clipboard-fallback.json`）。修复后类型检查、3 项测试及构建通过；已回写 accepted 裁决。

## 清理

两个验证会话最终均为 error（额度耗尽），没有运行中的 agent。已停止本次 pnpm dev 及浏览器 bookmarks-verify，确认 15534/23534/31534 均无监听；核对 ownership marker 后删除本次 dev 数据目录、临时项目目录、脚手架副本及 CLI wrapper。保留截图、命令结果和诊断日志，见证据目录 cleanup.json。
