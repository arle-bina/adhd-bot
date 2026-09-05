/**
 * Shared embed composition for commands that ship a chart.
 *
 * Once a card carries the numbers, repeating them in the embed is not redundancy
 * that costs nothing — it pushes the parts an image genuinely cannot do (links,
 * live timestamps) below the fold, and on mobile Discord reflows inline fields
 * into an unreadable grid.
 *
 * The division of labour these helpers assume:
 *
 *   card   → the figures, the shapes, the comparisons
 *   embed  → the hyperlinks, anything that ticks live, and one short line of
 *            text so the reply still means something with images off
 */

/** Discord's hard cap on an embed description. */
const DESCRIPTION_LIMIT = 4096;
/** Discord's hard cap on a single field value. */
export const FIELD_LIMIT = 1024;

export interface LinkItem {
  label: string;
  url?: string | null;
  /** Short muted qualifier, e.g. "NatCorp". Kept out of the link text. */
  note?: string;
}

/**
 * A compact run of hyperlinks, for an embed whose chart already lists the same
 * entities with their values.
 *
 * Deliberately carries no numbers: the chart has them, and a second copy is the
 * duplication this exists to remove. What it preserves is the one thing a PNG
 * cannot offer — a way to click through to the entity on the main site.
 *
 * @param limit Maximum entries to render before collapsing the tail into a
 *              count. Guards the description cap on long pages.
 */
export function linkRun(items: LinkItem[], limit = 25): string {
  if (items.length === 0) return "";

  const shown = items.slice(0, limit);
  const parts = shown.map((item) => {
    const label = item.url ? `[${item.label}](${item.url})` : item.label;
    return item.note ? `${label} *(${item.note})*` : label;
  });

  const hidden = items.length - shown.length;
  const tail = hidden > 0 ? ` · +${hidden} more` : "";
  const out = parts.join(" · ") + tail;

  // Truncate on a separator rather than mid-URL, which would emit a broken link.
  if (out.length <= DESCRIPTION_LIMIT) return out;
  let acc = "";
  for (const part of parts) {
    if (acc.length + part.length + 3 > DESCRIPTION_LIMIT - 24) break;
    acc += (acc ? " · " : "") + part;
  }
  return `${acc} · …`;
}

/**
 * One linked entity per line.
 *
 * The preferred form when the reader is likely to click through — a list of
 * rows scans better than an inline run once you are past a handful of entries,
 * and it keeps each entity's tap target its own line on mobile.
 *
 * Still carries no numbers: the chart beside it has them.
 */
export function linkList(items: LinkItem[], limit = 25): string {
  if (items.length === 0) return "";

  const shown = items.slice(0, limit);
  const lines = shown.map((item) => {
    const label = item.url ? `[${item.label}](${item.url})` : item.label;
    return item.note ? `${label} · *${item.note}*` : label;
  });

  const hidden = items.length - shown.length;
  if (hidden > 0) lines.push(`-# +${hidden} more`);

  let out = lines.join("\n");
  if (out.length > DESCRIPTION_LIMIT) {
    // Drop whole lines rather than truncating mid-URL, which breaks the link.
    const kept: string[] = [];
    let used = 0;
    for (const line of lines) {
      if (used + line.length + 1 > DESCRIPTION_LIMIT - 12) break;
      kept.push(line);
      used += line.length + 1;
    }
    out = `${kept.join("\n")}\n-# …`;
  }
  return out;
}

/**
 * Discord's small-text marker. Used for the one-line text equivalent of a card,
 * so it reads as a caption rather than competing with the chart.
 */
export function subtext(line: string): string {
  return `-# ${line}`;
}

/** Join non-empty parts with the house separator. */
export function meta(...parts: Array<string | null | undefined | false>): string {
  return parts.filter(Boolean).join(" · ");
}
