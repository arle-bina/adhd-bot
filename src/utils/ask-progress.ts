type ProgressKind = "status" | "action";

interface ProgressItem {
  label: string;
  kind: ProgressKind;
}

function cleanLabel(value: string): string {
  return String(value || "")
    .replace(/@/g, "at ")
    .replace(/[*~`>|]/g, "")
    .replace(/[.…]+$/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export class AskProgressState {
  private readonly maxItems: number;
  private items: ProgressItem[] = [];

  constructor(maxItems = 6) {
    this.maxItems = Math.max(2, maxItems);
  }

  status(label: string): void { this.push("status", label); }
  action(label: string): void { this.push("action", label); }

  private push(kind: ProgressKind, label: string): void {
    const clean = cleanLabel(label);
    if (!clean || this.items.at(-1)?.label === clean) return;
    this.items.push({ kind, label: clean });
    this.items = this.items.slice(-this.maxItems);
  }

  render(): string {
    if (!this.items.length) return "Working on it…";
    return ["Working on it…", ...this.items.map((item, index) =>
      `${index === this.items.length - 1 ? "•" : "✓"} ${item.label}${index === this.items.length - 1 ? "…" : ""}`,
    )].join("\n");
  }
}

interface ConversationEntry { id: string; expiresAt: number }

/** Sliding follow-up window. Activity extends the thread; inactivity starts a new topic. */
export class DiscordConversationTracker {
  private readonly ttlMs: number;
  private readonly entries = new Map<string, ConversationEntry>();

  constructor(ttlMs = 20 * 60_000) {
    this.ttlMs = ttlMs;
  }

  idFor(channelId: string, userId: string, now = Date.now()): string {
    const key = `${channelId}:${userId}`;
    const current = this.entries.get(key);
    if (current && current.expiresAt > now) {
      current.expiresAt = now + this.ttlMs;
      return current.id;
    }
    const id = `ask-${String(channelId).slice(-8)}-${String(userId).slice(-8)}-${now.toString(36)}`.slice(0, 40);
    this.entries.set(key, { id, expiresAt: now + this.ttlMs });
    if (this.entries.size > 2000) {
      for (const [entryKey, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(entryKey);
    }
    return id;
  }
}

/** Coalesces rapid SSE events to stay comfortably below Discord edit limits. */
export class AskProgressReporter {
  private readonly state = new AskProgressState();
  private readonly edit: (content: string) => Promise<unknown>;
  private readonly throttleMs: number;
  private lastEditAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private sending: Promise<void> | null = null;

  constructor(edit: (content: string) => Promise<unknown>, throttleMs = 1500) {
    this.edit = edit;
    this.throttleMs = throttleMs;
  }

  status(label: string): void { this.state.status(label); this.queue(); }
  action(label: string): void { this.state.action(label); this.queue(); }

  private queue(): void {
    if (this.stopped || this.timer) return;
    const delay = Math.max(0, this.throttleMs - (Date.now() - this.lastEditAt));
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.stopped) return;
      this.lastEditAt = Date.now();
      this.sending = Promise.resolve(this.edit(this.state.render())).then(() => undefined, () => undefined);
    }, delay);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.sending;
  }
}
