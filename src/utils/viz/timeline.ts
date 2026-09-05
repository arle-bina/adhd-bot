/**
 * Career timeline and achievement grid — the other two /profile tabs.
 *
 * A career is a sequence of wins and losses, and a bullet list flattens that
 * into undifferentiated text. The timeline gives it a spine, colours each event
 * by outcome, and puts the run of offices in order so a losing streak or a
 * steady climb is visible at a glance.
 */

import type { CanvasRenderingContext2D } from "canvas";
import { chromeHeight, drawEmptyState, ellipsize, renderCard, roundRect, type CardSpec, type Rect } from "./card.js";
import { font } from "./fonts.js";
import { AXIS, INK, STATUS, SURFACE, TYPE, alpha } from "./theme.js";

export type CareerOutcome = "elected" | "lost_election" | "resigned" | "appointed" | "removed";

export interface TimelineEvent {
  outcome: CareerOutcome;
  office: string;
  /** Right-hand detail — a party, a state. */
  detail?: string;
  /** Pre-formatted date. Formatting locale is the caller's business. */
  date: string;
}

export interface TimelineOptions extends Omit<CardSpec, "height"> {
  events: TimelineEvent[];
  emptyMessage?: string;
}

const PAD = 18;
const ROW_H = 30;
const SPINE_X = 16;

/**
 * Outcome colours. `elected` and `appointed` are both arrivals but not the same
 * thing — one was won, the other granted — so they are not merged.
 */
const OUTCOME: Record<CareerOutcome, { color: string; label: string }> = {
  elected: { color: STATUS.good, label: "Elected" },
  appointed: { color: STATUS.info, label: "Appointed" },
  resigned: { color: INK.muted, label: "Resigned" },
  lost_election: { color: STATUS.critical, label: "Lost" },
  removed: { color: STATUS.serious, label: "Removed" },
};

export function timelineHeight(eventCount: number, spec: Pick<CardSpec, "subtitle">): number {
  return Math.round(chromeHeight({ ...spec, footerLeft: " " }) + Math.max(1, eventCount) * ROW_H + PAD * 2);
}

export function renderTimeline(options: TimelineOptions): Buffer {
  const width = options.width ?? 640;
  const height = timelineHeight(options.events.length, options);

  return renderCard({ ...options, width, height }, (ctx, plot) => {
    if (options.events.length === 0) {
      drawEmptyState(ctx, plot, options.emptyMessage ?? "No career history yet.");
      return;
    }
    draw(ctx, plot, options.events);
  });
}

function draw(ctx: CanvasRenderingContext2D, plot: Rect, events: TimelineEvent[]): void {
  const x0 = plot.x + PAD;
  const spine = x0 + SPINE_X;
  const top = plot.y + PAD;

  // The spine, drawn first so the nodes sit on it
  ctx.strokeStyle = AXIS.gridStrong;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(spine, top + ROW_H / 2);
  ctx.lineTo(spine, top + (events.length - 0.5) * ROW_H);
  ctx.stroke();

  ctx.font = font(500, TYPE.footer, "mono");
  const dateW = Math.max(...events.map((e) => ctx.measureText(e.date).width));
  const right = plot.x + plot.w - PAD;
  const textX = spine + 16;
  const textMax = right - dateW - 14 - textX;

  events.forEach((event, i) => {
    const cy = top + (i + 0.5) * ROW_H;
    const { color, label } = OUTCOME[event.outcome] ?? OUTCOME.appointed;

    // Node
    ctx.beginPath();
    ctx.arc(spine, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = SURFACE.plot;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Office
    ctx.font = font(600, TYPE.label);
    ctx.fillStyle = INK.primary;
    const office = ellipsize(ctx, event.office, textMax * 0.62);
    ctx.fillText(office, textX, cy + 4);
    const officeW = ctx.measureText(office).width;

    // Outcome is stated in words, not left to the node colour alone
    ctx.font = font(500, 9.5, "mono");
    const lw = ctx.measureText(label).width;
    ctx.fillStyle = alpha(color, 0.18);
    roundRect(ctx, textX + officeW + 8, cy - 7, lw + 12, 15, 7.5);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(label, textX + officeW + 14, cy + 3.5);

    if (event.detail) {
      const detailX = textX + officeW + 8 + lw + 20;
      ctx.font = font(400, TYPE.footer);
      ctx.fillStyle = INK.muted;
      ctx.fillText(ellipsize(ctx, event.detail, right - dateW - 14 - detailX), detailX, cy + 3.5);
    }

    ctx.font = font(500, TYPE.footer, "mono");
    ctx.fillStyle = INK.muted;
    ctx.textAlign = "right";
    ctx.fillText(event.date, right, cy + 3.5);
    ctx.textAlign = "left";
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Achievements
// ───────────────────────────────────────────────────────────────────────────

export interface AchievementTile {
  name: string;
  description: string;
  /** Emoji or short glyph from the game. */
  icon: string;
  highlighted?: boolean;
}

export interface AchievementsOptions extends Omit<CardSpec, "height"> {
  achievements: AchievementTile[];
  /** Total earned, when more were earned than fit on the card. */
  totalEarned?: number;
  emptyMessage?: string;
}

const TILE_COLS = 2;
const TILE_H = 52;
const TILE_GAP = 8;

export function achievementsHeight(count: number, spec: Pick<CardSpec, "subtitle">): number {
  const rows = Math.ceil(Math.max(1, count) / TILE_COLS);
  return Math.round(chromeHeight({ ...spec, footerLeft: " " }) + rows * (TILE_H + TILE_GAP) - TILE_GAP + PAD * 2);
}

export function renderAchievements(options: AchievementsOptions): Buffer {
  const width = options.width ?? 660;
  const height = achievementsHeight(options.achievements.length, options);

  return renderCard({ ...options, width, height }, (ctx, plot) => {
    if (options.achievements.length === 0) {
      drawEmptyState(ctx, plot, options.emptyMessage ?? "No achievements earned yet.");
      return;
    }
    drawTiles(ctx, plot, options.achievements);
  });
}

function drawTiles(ctx: CanvasRenderingContext2D, plot: Rect, tiles: AchievementTile[]): void {
  const x0 = plot.x + PAD;
  const w = plot.w - PAD * 2;
  const colW = (w - TILE_GAP) / TILE_COLS;

  tiles.forEach((tile, i) => {
    const col = i % TILE_COLS;
    const row = Math.floor(i / TILE_COLS);
    const x = x0 + col * (colW + TILE_GAP);
    const y = plot.y + PAD + row * (TILE_H + TILE_GAP);

    // Highlighted achievements get the brand gold; the rest stay recessive so
    // the highlight actually means something.
    const accent = tile.highlighted ? "#d4af37" : INK.muted;

    ctx.fillStyle = tile.highlighted ? alpha(accent, 0.09) : alpha(INK.primary, 0.035);
    roundRect(ctx, x, y, colW, TILE_H, 8);
    ctx.fill();
    ctx.strokeStyle = tile.highlighted ? alpha(accent, 0.4) : SURFACE.border;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, colW - 1, TILE_H - 1, 8);
    ctx.stroke();

    // Icon well
    ctx.fillStyle = alpha(accent, tile.highlighted ? 0.16 : 0.08);
    roundRect(ctx, x + 9, y + 10, 32, 32, 8);
    ctx.fill();

    // node-canvas has no colour-emoji face, so a glyph that will not render is
    // replaced by the achievement's initial rather than drawn as tofu.
    ctx.font = font(500, 17);
    const glyph = renderableGlyph(ctx, tile.icon) ?? tile.name.slice(0, 1).toUpperCase();
    ctx.fillStyle = tile.highlighted ? accent : INK.secondary;
    ctx.textAlign = "center";
    ctx.fillText(glyph, x + 25, y + 32);
    ctx.textAlign = "left";

    const textX = x + 50;
    const textMax = colW - (textX - x) - 12;

    ctx.font = font(600, TYPE.label);
    ctx.fillStyle = INK.primary;
    ctx.fillText(ellipsize(ctx, tile.name, textMax), textX, y + 23);

    ctx.font = font(400, TYPE.footer);
    ctx.fillStyle = INK.muted;
    ctx.fillText(ellipsize(ctx, tile.description, textMax), textX, y + 38);
  });
}

/**
 * Return `glyph` only if the font can actually draw it.
 *
 * An emoji with no glyph measures as zero width (or renders as tofu) on a
 * headless box with no colour-emoji font, which would leave every tile showing
 * a box. Falls back to null so the caller can substitute.
 */
function renderableGlyph(ctx: CanvasRenderingContext2D, glyph: string): string | null {
  if (!glyph) return null;
  const w = ctx.measureText(glyph).width;
  if (w <= 0) return null;
  // Tofu boxes measure the same as the replacement character.
  const tofu = ctx.measureText("�").width;
  return Math.abs(w - tofu) < 0.01 ? null : glyph;
}
