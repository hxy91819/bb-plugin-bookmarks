import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  definePluginApp,
  experimental_copyToClipboard,
  useBbNavigate,
  useRealtime,
  useRpc,
  type ExperimentalSidebarFooterDisclosureProps,
} from "@get-bb/plugin-sdk/app";
import { groupBookmarks, type Bookmark, type rpcContract } from "./contract";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

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
}

function BookmarkRow({
  bookmark,
  onChanged,
  dismiss,
}: {
  bookmark: Bookmark;
  onChanged(): void;
  dismiss?(): void;
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
    dismiss?.();
  };
  return (
    <li className="rounded-lg border border-border bg-card p-3 space-y-2">
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

function BookmarkList({ compact = false, dismiss }: { compact?: boolean; dismiss?(): void }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [query, setQuery] = useState("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const limit = compact ? 10 : 100;
  useRealtime("changed", refresh);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      rpc.call("list", { query, limit, offset }).then(
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
  }, [rpc, query, limit, offset, revision]);
  return (
    <div
      className={
        compact
          ? "max-h-[70vh] overflow-y-auto p-3 space-y-3"
          : "h-full overflow-y-auto p-4 space-y-4"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{compact ? "最近书签" : "书签"}</h1>
        {compact && (
          <button
            className="text-sm underline"
            onClick={() => {
              navigate.toPluginPanel("bookmarks");
              dismiss?.();
            }}
          >
            查看全部
          </button>
        )}
      </div>
      <input
        aria-label="搜索书签"
        placeholder="搜索文字、备注、会话或项目"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOffset(0);
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
          {groupBookmarks(bookmarks).map((group) => (
            <section
              key={group.projectId}
              className="space-y-2"
              aria-label={`项目：${group.projectName}`}
            >
              <h2 className="text-sm font-semibold">{group.projectName}</h2>
              <ul className="space-y-2">
                {group.bookmarks.map((bookmark) => (
                  <BookmarkRow
                    key={bookmark.id}
                    bookmark={bookmark}
                    onChanged={refresh}
                    dismiss={dismiss}
                  />
                ))}
              </ul>
            </section>
          ))}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>共 {total} 条</span>
            {!compact && (
              <>
                <button
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  上一页
                </button>
                <button
                  disabled={offset + limit >= total}
                  onClick={() => setOffset(offset + limit)}
                >
                  下一页
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
function RecentBookmarks({ dismiss }: ExperimentalSidebarFooterDisclosureProps) {
  return <BookmarkList compact dismiss={dismiss} />;
}
function BookmarksPage() {
  return <BookmarkList />;
}

export default definePluginApp((app) => {
  app.slots.messageAction({
    id: "add-bookmark",
    title: "加书签",
    icon: "bookmarks/bookmark",
    async run(context) {
      try {
        await addBookmark(
          context.threadId,
          context.message.experimental_messageSeq,
          context.selectedText ?? context.message.text,
        );
        toast.success("已加书签");
      } catch (error) {
        toast.error(errorText(error));
      }
    },
  });
  app.slots.navPanel({
    id: "bookmarks",
    title: "书签",
    icon: "bookmarks/bookmark",
    path: "bookmarks",
    component: BookmarksPage,
  });
  app.experimental_sidebarFooter.register({
    kind: "disclosure",
    id: "recent",
    label: "最近书签",
    icon: "bookmarks/bookmark",
    component: RecentBookmarks,
  });
});
