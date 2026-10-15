# 书签 · BB plugin

将会话文字存为书签，按项目查看，并回到原会话的原消息。独立插件，运行时仅使用公开 `@get-bb/plugin-sdk`，数据保存在 BB 为插件提供的 SQLite 中。

## 安装

需要支持 SDK 0.6.37 的 BB、Node.js 22 或更新版本及 npm。在本目录执行：

```sh
npm ci
bb plugin build
bb plugin install . --yes
```

这是本地路径安装，目录需要保留。修改源码后执行 `bb plugin build` 和 `bb plugin reload bookmarks`，或用 `bb plugin dev`。

## 使用

- 选中 assistant 回复文字，在选区菜单点击“加书签”，保存精确选区。
- 消息操作栏的“加书签”保存整条消息文字，支持用户消息及 assistant 回复。成功显示 toast。
- 侧栏底部书签图标展开最近 10 条，可搜索文字、备注、会话标题及项目名称；“查看全部”打开导航栏书签页。
- 全页按项目分组，每页 100 条；可搜索、翻页、复制文字、删除和编辑备注。点击文字回到原会话的原消息。

定位使用 `toThread(threadId, { experimental_messageSeq })`。支持此扩展的宿主会加载并滚动到目标消息；较旧宿主忽略该选项时仍会打开会话。定位粒度是消息，不会高亮选中的句子。原会话或消息已删除时，书签文字仍保留，宿主负责显示目标不可用。

书签保留添加时的项目名称、会话标题、文字、创建时间和原消息编号。重复添加会创建独立书签。每条文字最多 200000 字符，备注最多 20000 字符。搜索将 `%`、`_` 按普通文字处理；SQLite 默认的 LIKE 不提供完整 Unicode 大小写折叠。

## CLI

```sh
bb bookmarks list --json
bb bookmarks list --project proj_example --limit 50 --offset 0 --json
bb bookmarks show <id> --json
bb bookmarks rm <id> --json
```

`list` 返回 `{bookmarks, total}`，按创建时间倒序；`show` 返回单个完整书签；`rm` 返回 `{id, removed}`。书签含 `id`、`threadId`、`messageSeq`、`projectId`、`projectName`、`threadTitle`、`text`、`note`、`createdAt`。无 `--json` 时输出缩进 JSON，便于人工读取。无效参数及不存在的 ID 返回非零退出码，JSON 模式错误输出至 stderr。列表超过宿主 CLI 字节限制时，请减小 `--limit` 分页读取。

## 开发与数据

```sh
npm run typecheck
npm test
npm run build
```

SDK 固定为公开 npm 包 `@get-bb/plugin-sdk@0.6.37`。消息定位扩展依据配套 BB 源码契约，以结构化选项调用，同时兼容尚未包含该选项的公开声明。

数据位于当前 BB 实例的 `plugins/bookmarks/data.db`；使用插件存储的追加式 migration，搜索和分页在 SQLite 中完成。卸载、备份及数据目录生命周期由 BB 管理。测试通过公开 SDK harness 操作真实 SQLite，覆盖重载持久化、搜索、项目筛选、备注、删除、分页与 CLI 行为。
