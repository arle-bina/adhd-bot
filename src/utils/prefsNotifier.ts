import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Client } from "discord.js";
import { getTurnStatus, lookupByName, getParty } from "./api.js";
import { readJsonSafe, writeJsonAtomic } from "./atomicJson.js";
import { usersWith, type Follow } from "./userPrefsStore.js";
import { describe } from "./followTargets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, "..", "..", "data", "prefs-notifier.json");
const POLL_MS = 2 * 60 * 1000;

interface NotifierState {
  lastTurn: number | null;
  /** follow key -> last seen summary */
  snapshots: Record<string, string>;
}

const followKey = (f: Follow): string => (f.kind === "politician" ? `p:${f.name.toLowerCase()}` : `q:${f.id}:${f.country}`);

async function snapshot(f: Follow): Promise<string | null> {
  try {
    if (f.kind === "politician") {
      const r = await lookupByName(f.name);
      const c = r.found ? r.characters[0] : undefined;
      return c ? `${c.position} | ${c.party} | ${c.state}` : null;
    }
    const r = await getParty(f.id, f.country);
    return r.found && r.party ? `${r.party.name} | chair ${r.party.chairName ?? "none"}` : null;
  } catch {
    return null;
  }
}

async function dm(client: Client, userId: string, content: string): Promise<void> {
  try {
    const user = await client.users.fetch(userId);
    await user.send(content);
  } catch {
    // DMs closed or user gone; nothing to do.
  }
}

/** One poll. Exported for tests; production uses startPrefsNotifier. */
export async function pollOnce(client: Client, stateFile = STATE_FILE): Promise<void> {
  const state = readJsonSafe<NotifierState>(stateFile, {
    fallback: { lastTurn: null, snapshots: {} },
    onCorrupt: "fallback",
  });
  const turn = (await getTurnStatus()).currentTurn;
  if (state.lastTurn === turn) return;
  const first = state.lastTurn === null;
  state.lastTurn = turn;

  if (!first) {
    for (const { userId } of usersWith("notifyTurn")) {
      await dm(client, userId, `Turn ${turn} has been processed.`);
    }
  }

  const watchers = usersWith("notifyFollows");
  const unique = new Map<string, Follow>();
  for (const w of watchers) for (const f of w.prefs.follows) unique.set(followKey(f), f);
  const changes = new Map<string, string>();
  for (const [key, f] of unique) {
    const snap = await snapshot(f);
    if (snap === null) continue;
    const prev = state.snapshots[key];
    if (!first && prev !== undefined && prev !== snap) changes.set(key, `${describe(f)} changed: ${prev} -> ${snap}`);
    state.snapshots[key] = snap;
  }
  for (const { userId, prefs } of watchers) {
    const lines = prefs.follows.map((f) => changes.get(followKey(f))).filter((l): l is string => Boolean(l));
    if (lines.length > 0) await dm(client, userId, `Updates from people and parties you follow (turn ${turn}):\n${lines.join("\n")}`.slice(0, 1900));
  }
  writeJsonAtomic(stateFile, state);
}

/** Starts the DM poller. Call once after the client is ready. Returns a stop function. */
export function startPrefsNotifier(client: Client): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await pollOnce(client);
    } catch (error) {
      console.error("[prefsNotifier] poll failed:", error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, POLL_MS);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
