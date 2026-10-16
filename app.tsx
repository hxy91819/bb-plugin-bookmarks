import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  definePluginApp,
  experimental_copyToClipboard,
  useBbNavigate,
  useRealtime,
  useRpc,
  useSdk,
  type PluginThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import { bookmarkSchema, groupBookmarks, type Bookmark, type rpcContract } from "./contract";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
let target: { threadId: string; id: string } | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getTarget = () => target;

async function addBookmark(threadId: string, messageSeq: number, text: string) {
  const response = await fetch("/api/v1/plugins/bookmarks/rpc/add", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ threadId, messageSeq, text }),
  });
  const body: unknown = await response.json();
  if (
    !response.ok ||
    typeof body !== "object" ||
    body === null ||
    !("ok" in body) ||
    body.ok !== true
  ) {
    throw new Error("添加书签失败，请重试");
  }
  return bookmarkSchema.parse("result" in body ? body.result : undefined);
}

function BookmarkRow({
  bookmark,
  onChanged,
  highlighted,
}: {
  bookmark: Bookmark;
  onChanged(): void;
  highlighted: boolean;
}) {
  const navigate = useBbNavigate();
  const rpc = useRpc<typeof rpcContract>();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(bookmark.note);
  const [pending, setPending] = useState(false);
  const run = async (action: () => Promise<unknown>, success: string) => {
    setPending(true);
    try {
      await action();
      toast.success(success);
      onChanged();
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    } finally {
      setPending(false);
    }
  };
  const open = () => {
    const options = { split: false, experimental_messageSeq: bookmark.messageSeq };
    try {
      navigate.toThread(bookmark.threadId, options);
    } catch {
      navigate.toThread(bookmark.threadId);
    }
  };
  return (
    <li
      ref={(element) => { if (highlighted) element?.scrollIntoView({ block: "nearest" }); }}
      data-bookmark-id={bookmark.id}
      className={`rounded-lg border bg-card p-3 space-y-2 ${highlighted ? "border-primary ring-2 ring-primary" : "border-border"}`}
    >
      <button
        className="block w-full text-left space-y-2"
        onClick={open}
        aria-label={`打开书签：${bookmark.threadTitle}`}
      >
        <span className="block text-xs text-muted-foreground">
          {bookmark.threadTitle} · 消息 {bookmark.messageSeq}
        </span>
        <span className="block whitespace-pre-wrap break-words text-sm max-h-64 overflow-y-auto">
          {bookmark.text}
        </span>
      </button>
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run(() => rpc.call("note", { id: bookmark.id, note }), "备注已保存"))
              setEditing(false);
          }}
        >
          <textarea
            aria-label="书签备注"
            className="w-full rounded border border-border bg-background p-2 text-sm"
            value={note}
            maxLength={20000}
            onChange={(event) => setNote(event.target.value)}
          />
          <button disabled={pending} type="submit" className="text-sm underline">
            保存备注
          </button>{" "}
          <button
            type="button"
            disabled={pending}
            className="text-sm underline"
            onClick={() => setEditing(false)}
          >
            取消
          </button>
        </form>
      ) : bookmark.note ? (
        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
          备注：{bookmark.note}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <time dateTime={bookmark.createdAt}>{new Date(bookmark.createdAt).toLocaleString()}</time>
        <button
          disabled={pending}
          onClick={() =>
            void run(async () => {
              if (!(await experimental_copyToClipboard({ text: bookmark.text }))) {
                throw new Error("复制失败，请重试");
              }
            }, "文字已复制")
          }
        >
          复制文字
        </button>
        <button
          disabled={pending}
          onClick={() => {
            setNote(bookmark.note);
            setEditing(true);
          }}
        >
          改备注
        </button>
        <button
          disabled={pending}
          onClick={() => void run(() => rpc.call("remove", { id: bookmark.id }), "书签已删除")}
        >
          删除
        </button>
      </div>
    </li>
  );
}

function BookmarksPanel({ threadId }: PluginThreadPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const sdk = useSdk();
  const requestedTarget = useSyncExternalStore(subscribe, getTarget);
  const selectedId = requestedTarget?.threadId === threadId ? requestedTarget.id : null;
  const [projectId, setProjectId] = useState<string | null>(null);
  const [currentProjectOnly, setCurrentProjectOnly] = useState(true);
  const [query, setQuery] = useState("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useRealtime("changed", refresh);
  useEffect(() => {
    let active = true;
    setProjectId(null);
    sdk.threads.get({ threadId }).then(
      (thread) => { if (active) setProjectId(thread.projectId); },
      (cause) => { if (active) { setError(errorText(cause)); setLoading(false); } },
    );
    return () => { active = false; };
  }, [sdk, threadId]);
  useEffect(() => {
    if (!selectedId) return;
    setQuery("");
    setCurrentProjectOnly(true);
    refresh();
  }, [selectedId, refresh]);
  useEffect(() => {
    if (projectId === null) return;
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      const load = async () => {
        const bookmarks: Bookmark[] = [];
        let total = 0;
        do {
          const page = await rpc.call("list", {
            query, ...(currentProjectOnly ? { projectId } : {}),
            limit: 200, offset: bookmarks.length,
          });
          if (!active) return { bookmarks, total };
          bookmarks.push(...page.bookmarks);
          total = page.total;
          if (page.bookmarks.length === 0) break;
        } while (bookmarks.length < total);
        return { bookmarks, total };
      };
      load().then(
        (result) => {
          if (!active) return;
          setBookmarks(result.bookmarks);
          setTotal(result.total);
          setError(null);
          setLoading(false);
        },
        (cause) => {
          if (active) {
            setError(errorText(cause));
            setLoading(false);
          }
        },
      );
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [rpc, query, projectId, currentProjectOnly, revision]);
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={currentProjectOnly}
          onChange={(event) => setCurrentProjectOnly(event.target.checked)} />
        仅当前项目
      </label>
      <input
        aria-label="搜索书签"
        placeholder="搜索文字、备注、会话或项目"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}{" "}
          <button className="underline" onClick={refresh}>
            重试
          </button>
        </p>
      ) : loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          正在加载…
        </p>
      ) : (
        <>
          {bookmarks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {query
                ? "没有匹配的书签"
                : "还没有书签。在消息上点击“加书签”，或选中回复文字后添加。"}
            </p>
          )}
          {groupBookmarks(bookmarks, threadId, !currentProjectOnly).map((group) => (
            <section
              key={group.id}
              className="space-y-2"
              aria-label={group.title}
            >
              <h2 className="text-sm font-semibold">{group.title}</h2>
              <ul className="space-y-2">
                {group.bookmarks.map((bookmark) => (
                  <BookmarkRow
                    key={bookmark.id}
                    bookmark={bookmark}
                    onChanged={refresh}
                    highlighted={bookmark.id === selectedId}
                  />
                ))}
              </ul>
            </section>
          ))}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>共 {total} 条</span>
          </div>
        </>
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.messageAction({
    id: "add-bookmark",
    title: "加书签",
    icon: "bookmarks/bookmark",
    async run(context) {
      try {
        const bookmark = await addBookmark(
          context.threadId,
          context.message.experimental_messageSeq,
          context.selectedText ?? context.message.text,
        );
        target = { threadId: context.threadId, id: bookmark.id };
        listeners.forEach((listener) => listener());
        context.openPanel({ actionId: "bookmarks" });
        toast.success("已加书签");
      } catch (error) {
        toast.error(errorText(error));
      }
    },
  });
  app.slots.threadPanelAction({
    id: "bookmarks",
    title: "书签",
    icon: "bookmarks/bookmark",
    layout: "flush",
    component: BookmarksPanel,
  });
});
