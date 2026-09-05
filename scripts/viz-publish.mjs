/**
 * Publish the rendered previews to the ops static host so they can be reviewed
 * from a phone.
 *
 *   npx tsx scripts/viz-preview.ts .viz-preview && node scripts/viz-publish.mjs
 *
 * Ops-only: the target directory is served by the ops box, not by the game, and
 * nothing here ships to players.
 */

import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = process.argv[2] ?? ".viz-preview";
const DEST = process.argv[3] ?? "/srv/ahd-public/viz-preview";

/** Caption every figure so the page explains what changed, not just what it is. */
const CAPTIONS = [
  ["marketshare.png", "/marketshare", "Was a 15-slice doughnut whose legend ate the canvas. Ranked bars: one row per corporation, direct-labelled, NatCorp tagged."],
  ["westminster.png", "/predict — House of Commons", "The game's own Westminster chart (westminster-svg), in the house card. Facing benches with crossbenches — not a hemicycle."],
  ["westminster-hung.png", "/predict — hung parliament", "No single party clears the line, so the benches are labelled neutrally instead of asserting a government."],
  ["hemicycle.png", "/predict — Congress", "Arch chambers use the game's own sizing tiers, so a 100-seat Senate and a 2,980-seat NPC both fit."],
  ["hemicycle-many.png", "/predict — Bundestag", "Six parties. CDU/CSU's near-black brand colour is lifted just enough to be visible on the graphite surface."],
  ["profile.png", "/profile", "Avatar (initials placeholder when there is no PFP), party chip, headline figures, approval and infamy meters, and a political compass."],
  ["profile-minimal.png", "/profile — no policy data", "Degrades cleanly: no compass, and the meters still read."],
  ["party.png", "/party", "Same card, different entity. Party logo from the game's own endpoint; ideology plotted rather than named."],
  ["leaderboard.png", "/leaderboard", "A ranking drawn as a ranking. The gap between first and tenth is a length, not a count of digits."],
  ["sectors.png", "/sectors", "Owned sectors by revenue, growth as a signed column. Growth gets no second bar — two scales in one frame invent correlations."],
  ["race.png", "/election", "Replaces the ▓░ blocks in the embed body. Vote share as length, party colour, EV or raw count beside it."],
  ["forex.png", "/forex", "Seven currencies indexed to period open. The old palette failed the colourblind validator badly; this one passes every gate."],
  ["stock-single.png", "/stock-chart", "Direction-aware single series with an end label."],
  ["stock-down.png", "/stock-chart — falling period", "Same renderer, negative period."],
  ["candles.png", "/market — candlesticks", "Hollow up bars, filled down bars, so direction survives greyscale."],
  ["serverstats.png", "/serverstats", "Area chart on the house palette."],
  ["marketshare-sparse.png", "/marketshare — few rows", ""],
  ["marketshare-empty.png", "/marketshare — empty state", "An empty result still looks intentional."],
];

mkdirSync(DEST, { recursive: true });

const available = new Set(readdirSync(SRC).filter((f) => f.endsWith(".png")));
for (const f of available) copyFileSync(join(SRC, f), join(DEST, f));

const captioned = new Set(CAPTIONS.map(([f]) => f));
const figures = [
  ...CAPTIONS.filter(([f]) => available.has(f)),
  // Anything rendered but not captioned still gets shown, so a new chart never
  // silently fails to appear on the review page.
  ...[...available].filter((f) => !captioned.has(f)).sort().map((f) => [f, f.replace(/\.png$/, ""), ""]),
];

const body = figures
  .map(([file, title, caption]) => {
    const meta = caption ? `<p class=meta>${caption}</p>` : "";
    return `<figure><h2>${title}</h2>${meta}<img src="${file}" alt="${title}" loading="lazy"></figure>`;
  })
  .join("\n");

writeFileSync(
  join(DEST, "index.html"),
  `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>AHD bot — chart house style</title>
<style>
:root{--bg:#14141c;--card:#1d1d2a;--bd:#2a2a3d;--fg:#e8e8ee;--mut:#8f8f9d;--red:#dc2626}
*{box-sizing:border-box}
body{margin:0;padding:40px 20px;background:var(--bg);color:var(--fg);
font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.w{max-width:1000px;margin:0 auto}
h1{font-size:26px;margin:0 0 6px;letter-spacing:-.02em}
h1::before{content:"";display:inline-block;width:3px;height:22px;background:var(--red);
border-radius:2px;margin-right:11px;vertical-align:-3px}
.sub{color:var(--mut);margin:0 0 36px;font-size:14px}
h2{font-size:15px;margin:0 0 4px;letter-spacing:-.01em}
.meta{color:var(--mut);font-size:13px;margin:0 0 12px;max-width:70ch}
figure{margin:0}
img{width:100%;display:block;border:1px solid var(--bd);border-radius:12px;background:var(--card)}
.grid{display:grid;gap:32px}
footer{color:var(--mut);font-size:12.5px;margin-top:48px;border-top:1px solid var(--bd);padding-top:14px}
code{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12.5px;color:#b4b4c2}
</style>
<div class=w>
<h1>Discord bot &mdash; chart house style</h1>
<p class=sub>Branch <code>feat/viz-house-style</code> &middot; game design tokens, Geist Sans + JetBrains Mono,
AHD mark, colourblind-validated palette. Chamber diagrams ported from the game so Discord and the site draw
the same picture.</p>
<div class=grid>
${body}
</div>
<footer>${figures.length} figures, rendered from fixtures via <code>npx tsx scripts/viz-preview.ts</code>.
Regenerate this page with <code>node scripts/viz-publish.mjs</code>.</footer>
</div>
`,
);

console.log(`Published ${figures.length} figures to ${DEST}`);
