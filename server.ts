import { randomUUID } from "node:crypto";
import { PLUGIN_CLI_OUTPUT_MAX_BYTES, type BbPluginApi } from "@get-bb/plugin-sdk";
import { bookmarkSchema, listInput, rpcContract, type Bookmark } from "./contract";

export default function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    `CREATE TABLE bookmarks (id TEXT PRIMARY KEY, threadId TEXT NOT NULL, messageSeq INTEGER NOT NULL, projectId TEXT NOT NULL, projectName TEXT NOT NULL, threadTitle TEXT NOT NULL, text TEXT NOT NULL, note TEXT NOT NULL, createdAt TEXT NOT NULL)`,
    `CREATE INDEX bookmarks_recent ON bookmarks(createdAt DESC, id DESC)`,
    `CREATE INDEX bookmarks_project ON bookmarks(projectId, createdAt DESC, id DESC)`,
  ]);
  const get = (id: string) => {
    const row = db.prepare("SELECT * FROM bookmarks WHERE id = ?").get(id);
    return row ? bookmarkSchema.parse(row) : null;
  };
  const list = (input: ReturnType<typeof listInput.parse>) => {
    const term = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`;
    const where = `WHERE (? IS NULL OR projectId = ?) AND (text LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\' OR threadTitle LIKE ? ESCAPE '\\' OR projectName LIKE ? ESCAPE '\\')`;
    const values = [input.projectId ?? null, input.projectId ?? null, term, term, term, term];
    const bookmarks = db
      .prepare(`SELECT * FROM bookmarks ${where} ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...values, input.limit, input.offset)
      .map((row) => bookmarkSchema.parse(row));
    const count = db.prepare(`SELECT count(*) AS total FROM bookmarks ${where}`).get(...values);
    const total = Number((count as { total: number }).total);
    return { bookmarks, total };
  };
  const changed = () => bb.realtime.publish("changed", {});
  const remove = (id: string) => {
    const removed = db.prepare("DELETE FROM bookmarks WHERE id = ?").run(id).changes > 0;
    if (removed) changed();
    return { removed };
  };
  bb.rpc.register(rpcContract, {
    list,
    async add(input) {
      const thread = await bb.sdk.threads.get({ threadId: input.threadId });
      const project = await bb.sdk.projects.get({ projectId: thread.projectId });
      const bookmark: Bookmark = {
        ...input,
        id: randomUUID(),
        projectId: thread.projectId,
        projectName: project.name,
        threadTitle: thread.title ?? "未命名会话",
        note: "",
        createdAt: new Date().toISOString(),
      };
      db.prepare(
        "INSERT INTO bookmarks (id, threadId, messageSeq, projectId, projectName, threadTitle, text, note, createdAt) VALUES (@id, @threadId, @messageSeq, @projectId, @projectName, @threadTitle, @text, @note, @createdAt)",
      ).run(bookmark);
      changed();
      return bookmark;
    },
    note({ id, note }) {
      if (!get(id)) throw new Error(`书签不存在: ${id}`);
      db.prepare("UPDATE bookmarks SET note = ? WHERE id = ?").run(note, id);
      changed();
      return get(id)!;
    },
    remove: ({ id }) => remove(id),
  });
  const usage =
    "bb bookmarks list [--project <project-id>] [--limit <1-200>] [--offset <n>] [--json]\nbb bookmarks show <id> [--json]\nbb bookmarks rm <id> [--json]";
  bb.cli.register({
    name: "bookmarks",
    summary: "查看和删除会话书签",
    commands: [
      { name: "list", summary: "列出最近书签，可按项目筛选", usage: usage.split("\n")[0] },
      { name: "show", summary: "查看完整书签", usage: usage.split("\n")[1] },
      { name: "rm", summary: "删除书签", usage: usage.split("\n")[2] },
    ],
    async run(argv) {
      const json = argv.includes("--json");
      const [command, ...args] = argv.filter((arg) => arg !== "--json");
      const reply = (value: unknown) => {
        const stdout = JSON.stringify(value, null, json ? undefined : 2);
        if (Buffer.byteLength(stdout) > PLUGIN_CLI_OUTPUT_MAX_BYTES)
          return {
            exitCode: 1,
            stderr: json
              ? JSON.stringify({ error: "结果过大，请减小 --limit 分页读取" })
              : "结果过大，请减小 --limit 分页读取",
          };
        return { exitCode: 0, stdout };
      };
      const fail = (message: string) => ({
        exitCode: 1,
        stderr: json ? JSON.stringify({ error: message }) : message,
      });
      if (!command || command === "--help" || command === "help")
        return { exitCode: 0, stdout: usage };
      if (command === "list") {
        const options: Record<string, string | number> = {};
        for (let i = 0; i < args.length; i += 2) {
          const flag = args[i],
            value = args[i + 1];
          if (!value || !["--project", "--limit", "--offset"].includes(flag)) return fail(usage);
          const key = flag === "--project" ? "projectId" : flag.slice(2);
          if (key in options) return fail(`重复参数: ${flag}`);
          options[key] = flag === "--project" ? value : Number(value);
        }
        const parsed = listInput.safeParse(options);
        if (!parsed.success) return fail(usage);
        return reply(list(parsed.data));
      }
      if ((command === "show" || command === "rm") && args.length === 1) {
        const bookmark = get(args[0]);
        if (!bookmark) return fail(`书签不存在: ${args[0]}`);
        return reply(command === "show" ? bookmark : { id: args[0], ...remove(args[0]) });
      }
      return fail(usage);
    },
  });
}
