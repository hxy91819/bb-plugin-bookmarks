import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const bookmarkSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  messageSeq: z.number().int().positive(),
  projectId: z.string(),
  projectName: z.string(),
  threadTitle: z.string(),
  text: z.string(),
  note: z.string(),
  createdAt: z.string(),
});
export type Bookmark = z.infer<typeof bookmarkSchema>;
export const listInput = z.object({
  query: z.string().max(1000).default(""),
  projectId: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(100),
  offset: z.number().int().nonnegative().default(0),
});
export const addInput = z.object({
  threadId: z.string().min(1),
  messageSeq: z.number().int().positive(),
  text: z.string().min(1).max(200000),
});
export const rpcContract = defineRpcContract({
  list: {
    input: listInput,
    output: z.object({ bookmarks: z.array(bookmarkSchema), total: z.number() }),
  },
  add: { input: addInput, output: bookmarkSchema },
  note: {
    input: z.object({ id: z.string().min(1), note: z.string().max(20000) }),
    output: bookmarkSchema,
  },
  remove: {
    input: z.object({ id: z.string().min(1) }),
    output: z.object({ removed: z.boolean() }),
  },
});

export function groupBookmarks(bookmarks: Bookmark[]) {
  const groups = new Map<
    string,
    { projectId: string; projectName: string; bookmarks: Bookmark[] }
  >();
  for (const bookmark of bookmarks) {
    let group = groups.get(bookmark.projectId);
    if (!group) {
      group = { projectId: bookmark.projectId, projectName: bookmark.projectName, bookmarks: [] };
      groups.set(bookmark.projectId, group);
    }
    group.bookmarks.push(bookmark);
  }
  return [...groups.values()];
}
