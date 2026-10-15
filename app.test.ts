import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPluginApp } from "@get-bb/plugin-sdk/testing/app";
import app from "./app";

test("选区 action 保留精确选区，消息按钮保存整条文字和原消息编号", async () => {
  const previousFetch = globalThis.fetch;
  const previousRuntime = Object.getOwnPropertyDescriptor(globalThis, "__bbPluginRuntime");
  const requests: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/v1/plugins/bookmarks/rpc/add");
    assert.equal(init?.method, "POST");
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ ok: true, result: {} });
  };
  try {
    const captured = await loadPluginApp(app);
    const action = captured.messageActions.find((item) => item.id === "add-bookmark")!;
    const context = {
      threadId: "thread-a",
      message: {
        id: "msg-41",
        threadId: "thread-a",
        role: "assistant" as const,
        text: "整条回复：甲 乙 丙",
        sourceSeqEnd: 50,
        experimental_messageSeq: 41,
      },
      composer: null,
      openPanel: () => false,
    };
    await action.run({ ...context, selectedText: " 乙\n" });
    await action.run(context);
    assert.deepEqual(requests, [
      { threadId: "thread-a", messageSeq: 41, text: " 乙\n" },
      { threadId: "thread-a", messageSeq: 41, text: "整条回复：甲 乙 丙" },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousRuntime) Object.defineProperty(globalThis, "__bbPluginRuntime", previousRuntime);
    else Reflect.deleteProperty(globalThis, "__bbPluginRuntime");
  }
});
