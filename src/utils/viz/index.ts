/**
 * The AHD chart house style.
 *
 * Every visualisation the bot emits goes through here, so /marketshare,
 * /forex and /profile read as one product rather than three. Commands import
 * from this barrel; they never reach for chart internals or raw hex.
 */

export * from "./theme.js";
export * from "./format.js";
export { renderCard, roundRect, ellipsize, drawEmptyState, SITE, type CardSpec, type Rect } from "./card.js";
export { ensureFonts, font } from "./fonts.js";
export { renderBarChart, barChartHeight, type BarRow, type BarChartOptions } from "./bars.js";
export {
  renderTimeline,
  renderAchievements,
  timelineHeight,
  achievementsHeight,
  type TimelineEvent,
  type TimelineOptions,
  type AchievementTile,
  type AchievementsOptions,
  type CareerOutcome,
} from "./timeline.js";
export {
  renderVersus,
  versusHeight,
  type VersusMetric,
  type VersusSide,
  type VersusOptions,
} from "./versus.js";
export {
  renderComposition,
  compositionHeight,
  type CompositionSegment,
  type CompositionOptions,
} from "./composition.js";
export {
  renderChamber,
  chamberHeight,
  archLayout,
  buildWestminsterParliament,
  renderWestminsterImage,
  splitBenches,
  getParliamentSizing,
  computeRowRadii,
  type ChamberShape,
  type ChamberParty,
  type ChamberOptions,
  type ArchSeat,
} from "./chamber.js";
export { warmBrandAssets, brandMark, drawBrandMark } from "./brand.js";
export { loadAvatar, initialsFor, drawAvatar } from "./avatar.js";
export {
  renderTimeSeries,
  renderCandles,
  renderPriceWithVolume,
  type TimeSeries,
  type TimeSeriesOptions,
  type Candle,
  type CandleOptions,
  type PricePanelOptions,
} from "./timeseries.js";
export {
  renderEntityCard,
  renderEntityCardSync,
  approvalColor,
  infamyColor,
  type EntityCardOptions,
  type ProfileStat,
  type ProfileMeter,
} from "./profile.js";
