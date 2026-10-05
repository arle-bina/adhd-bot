import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { AskProgressState, previewFrom } from "../../src/utils/ask-progress.js";
import { continuationFor, registerAskAnswer } from "../../src/utils/ask-continuation.js";
import { _resetAskAnswerStore, askAnswerRecord } from "../../src/utils/ask-continuation-store.js";

describe("streamed answer preview", () => {
  it("switches from progress lines to the answer once deltas arrive", () => {
    const state = new AskProgressState();
    state.status("Vector-searching code & docs…");
    expect(state.render()).toContain("Working on it…");
    state.delta("Cloture needs three fifths ");
    state.delta("of votes cast.");
    const preview = state.render();
    expect(preview).toContain("Cloture needs three fifths of votes cast.");
    expect(preview).toContain("▍");
    expect(preview).not.toContain("Working on it…");
  });

  it("hides machine markers and raw visualization sources, closes dangling fences", () => {
    const preview = previewFrom("Answer text\n```mermaid\nxychart-beta\n");
    expect(preview).toContain("[visualization rendering…]");
    expect(preview).not.toContain("xychart");
    expect(previewFrom("Done. <!--FU [\"next?\"]-->")).not.toContain("FU");
    const dangling = previewFrom("Some code:\n```ts\nconst x = 1;");
    expect((dangling.match(/```/g) || []).length % 2).toBe(0);
  });

  it("caps preview length under the Discord message limit", () => {
    const preview = previewFrom("word ".repeat(1000));
    expect(preview.length).toBeLessThan(1900);
  });
});

describe("reply-to-continue gate", () => {
  beforeEach(() => {
    _resetAskAnswerStore(join(mkdtempSync(join(tmpdir(), "ask-answers-")), "answers.json"));
  });

  it("only continues for the original asker replying to a tracked answer", () => {
    registerAskAnswer("msg-1", { userId: "user-1", question: "how does cloture work?" });
    expect(continuationFor({ authorId: "user-1", authorIsBot: false, repliedToMessageId: "msg-1", content: "and in the House?" })).toBeTruthy();
    expect(continuationFor({ authorId: "user-2", authorIsBot: false, repliedToMessageId: "msg-1", content: "and in the House?" })).toBeNull();
    expect(continuationFor({ authorId: "user-1", authorIsBot: false, repliedToMessageId: "untracked", content: "and in the House?" })).toBeNull();
    expect(continuationFor({ authorId: "user-1", authorIsBot: true, repliedToMessageId: "msg-1", content: "and in the House?" })).toBeNull();
    expect(continuationFor({ authorId: "user-1", authorIsBot: false, repliedToMessageId: null, content: "and in the House?" })).toBeNull();
    expect(continuationFor({ authorId: "user-1", authorIsBot: false, repliedToMessageId: "msg-1", content: "ok" })).toBeNull();
  });
});

describe("answer registry", () => {
  it("persists across a reload so follow-ups survive a restart", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "ask-answers-")), "answers.json");
    _resetAskAnswerStore(file);
    registerAskAnswer("msg-9", { userId: "user-9", question: "what sets the prime rate?" });
    await new Promise(resolve => setTimeout(resolve, 2_200));
    _resetAskAnswerStore(file);
    expect(askAnswerRecord("msg-9")).toMatchObject({ userId: "user-9" });
  });
});
