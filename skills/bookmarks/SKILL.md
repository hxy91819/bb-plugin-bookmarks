---
name: bookmarks
description: 查询、读取或删除用户通过消息菜单收藏的会话书签。
---

使用 `bb bookmarks list --json` 查询最近书签，`--project <project-id>` 筛选项目。
返回 `{bookmarks, total}`，默认 100 条；用 `--limit <1-200> --offset <n>` 翻页。
用 `bb bookmarks show <id> --json` 读取完整文字、备注和原消息位置。
仅在用户要求删除时执行 `bb bookmarks rm <id> --json`。
缺失 ID、无效参数返回非零退出码；JSON 模式错误在 stderr 中。
书签由消息“加书签”按钮或 assistant 回复选区菜单创建，备注在书签页面编辑。
