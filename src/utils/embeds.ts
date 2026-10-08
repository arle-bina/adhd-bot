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

// ---------------------------------------------------------------------------
// Shared embed factory: colours, footer, timestamps, truncation guards.
// Commands build player-facing embeds through these so they stay cohesive.
// ---------------------------------------------------------------------------

import { EmbedBuilder } from "discord.js";

export const SITE_FOOTER_TEXT = "ahousedividedgame.com";
/** Discord's hard cap on an embed title. */
export const TITLE_LIMIT = 256;

export const EMBED_COLORS = {
  brand: 0x5865f2,
  info: 0x3b82f6,
  success: 0x57f287,
  warning: 0xfee75c,
  error: 0xed4245,
} as const;

/** Cut `text` to `max` characters, ending with an ellipsis when shortened. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return max <= 1 ? text.slice(0, max) : `${text.slice(0, max - 1)}…`;
}

export const clampTitle = (t: string): string => truncate(t, TITLE_LIMIT);
export const clampDescription = (t: string): string => truncate(t, DESCRIPTION_LIMIT);
export const clampField = (t: string): string => truncate(t, FIELD_LIMIT);

/** Footer object with the site attribution, optionally preceded by extra context. */
export function siteFooter(...extra: Array<string | null | undefined | false>): { text: string } {
  return { text: [...extra.filter(Boolean), SITE_FOOTER_TEXT].join(" · ") };
}

/** Discord relative/absolute timestamp markup for a unix-seconds or Date value. */
export function discordTime(when: number | Date, style: "R" | "F" | "f" | "D" | "d" | "t" | "T" = "R"): string {
  const unix = when instanceof Date ? Math.floor(when.getTime() / 1000) : Math.floor(when);
  return `<t:${unix}:${style}>`;
}

export interface BaseEmbedOptions {
  title?: string;
  description?: string;
  color?: number;
  /** Extra footer context placed before the site attribution. */
  footer?: string;
  /** Set the embed timestamp to now. Default false so existing output is unchanged. */
  timestamp?: boolean;
  url?: string;
}

/** An EmbedBuilder with brand colour, site footer and length guards applied. */
export function baseEmbed(opts: BaseEmbedOptions = {}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(opts.color ?? EMBED_COLORS.brand)
    .setFooter(siteFooter(opts.footer));
  if (opts.title) embed.setTitle(clampTitle(opts.title));
  if (opts.description) embed.setDescription(clampDescription(opts.description));
  if (opts.url) embed.setURL(opts.url);
  if (opts.timestamp) embed.setTimestamp();
  return embed;
}

/** addFields with every name/value clamped to Discord's limits. */
export function addSafeFields(
  embed: EmbedBuilder,
  fields: Array<{ name: string; value: string; inline?: boolean }>,
): EmbedBuilder {
  return embed.addFields(
    fields.slice(0, 25).map((f) => ({ name: truncate(f.name, 256) || "​", value: clampField(f.value) || "​", inline: f.inline })),
  );
}
