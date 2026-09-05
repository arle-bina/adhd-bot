/**
 * `westminster-svg` ships no types. The shape below is the subset the bot uses,
 * matching the game's own wrapper in `src/lib/charts/westminsterParliament.ts`.
 */
declare module "westminster-svg" {
  type Side = Record<string, { seats: number; colour: string }>;
  interface Parliament {
    headBench: Side;
    left: Side;
    right: Side;
    crossBench: Side;
  }
  /** Returns a hast tree; pass it to `hast-util-to-html`. */
  export default function generate(parliament: Parliament): unknown;
}
