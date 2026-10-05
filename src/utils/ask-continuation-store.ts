import { join } from "path";
import { fileURLToPath } from "url";
import { readJsonSafe, writeJsonAtomic } from "./atomicJson.js";

// Which bot messages are Ask answers, and who asked. Persisted so replying to
// an answer still continues the conversation after the bot restarts.

export interface AnswerRecord {
  userId: string;
  question: string;
  savedAt?: number;
}

const MAX_TRACKED = 500;
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_FILE = join(__dirname, "..", "..", "data", "ask-answers.json");

let file = process.env.ASK_ANSWERS_FILE || DEFAULT_FILE;
let answers: Map<string, AnswerRecord> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function load(): Map<string, AnswerRecord> {
  if (answers) return answers;
  const stored = readJsonSafe<Record<string, AnswerRecord>>(file, { fallback: {}, onCorrupt: "fallback" });
  const now = Date.now();
  answers = new Map(Object.entries(stored).filter(([, record]) =>
    record && typeof record.userId === "string" && now - (record.savedAt ?? 0) < MAX_AGE_MS));
  return answers;
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      writeJsonAtomic(file, Object.fromEntries(load()));
    } catch (error) {
      // Losing the registry only costs reply-to-continue after a restart.
      console.error("[ask] could not persist answer registry:", error instanceof Error ? error.message : String(error));
    }
  }, 2_000);
  flushTimer.unref?.();
}

export function registerAskAnswer(messageId: string, record: AnswerRecord): void {
  const map = load();
  map.set(messageId, { ...record, savedAt: record.savedAt ?? Date.now() });
  while (map.size > MAX_TRACKED) {
    const oldest = map.keys().next().value;
    if (!oldest) break;
    map.delete(oldest);
  }
  scheduleFlush();
}

export function askAnswerRecord(messageId: string): AnswerRecord | undefined {
  return load().get(messageId);
}

/** Test hook: point the store at a scratch file and forget cached state. */
export function _resetAskAnswerStore(path?: string): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  answers = null;
  file = path || process.env.ASK_ANSWERS_FILE || DEFAULT_FILE;
}
