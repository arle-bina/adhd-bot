import { getPrefs, removeFollow, type Follow } from "./userPrefsStore.js";

export function describe(f: Follow): string {
  return f.kind === "politician" ? `Politician: ${f.name}` : `Party #${f.id} (${f.country})`;
}

export function partyKey(f: Follow): string {
  return f.kind === "party" ? `${f.id}:${f.country}` : "";
}

/** Parses an `/unfollow` target: a party key `id:country` or a politician name. */
export function parseTarget(userId: string, target: string): Follow {
  const m = /^(\S+):([A-Za-z]{2,3})$/.exec(target.trim());
  if (m) {
    const key = `${m[1]}:${m[2].toUpperCase()}`;
    const hit = getPrefs(userId).follows.find((f) => partyKey(f) === key);
    if (hit) return hit;
    return { kind: "party", id: m[1], country: m[2].toUpperCase() };
  }
  return { kind: "politician", name: target.trim() };
}


export function followTargetChoices(userId: string, typed: string): Array<{ name: string; value: string }> {
  const q = typed.toLowerCase();
  return getPrefs(userId)
    .follows.map((f) => ({
      name: describe(f).slice(0, 100),
      value: f.kind === "politician" ? f.name.slice(0, 100) : partyKey(f),
    }))
    .filter((c) => c.name.toLowerCase().includes(q))
    .slice(0, 25);
}

/** Removes a follow by target string; returns the user-facing message. */
export function removeTarget(userId: string, target: string): string {
  const follow = parseTarget(userId, target);
  return removeFollow(userId, follow) ? `Unfollowed ${describe(follow)}.` : "You are not following that.";
}
