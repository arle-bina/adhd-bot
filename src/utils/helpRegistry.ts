/*
 * Help metadata that cannot be derived from a command's SlashCommandBuilder:
 * category grouping, examples, and optional long-form details.
 *
 * Command names, descriptions, options, subcommands and permission gates all
 * come from the loaded command modules (see commandCatalog.ts), so adding a
 * command only requires listing its name in a category here. A test fails if a
 * command file is missing from the categories or a listed name no longer exists.
 */

export interface HelpExtras {
  examples: string[];
  /** Longer prose shown on the single-command page and category pages. */
  details?: string;
}

export interface Category {
  label: string;
  emoji: string;
  color: number;
  description: string;
  /** Staff categories are only listed for members who hold a staff permission. */
  staff?: boolean;
  /** Command names, without the leading slash. */
  commands: string[];
}

export const categories: Category[] = [
  {
    label: "Players",
    emoji: "👤",
    color: 0x5865f2,
    description: "Look up politicians, compare them, and see how they rank.",
    commands: ["profile", "leaderboard", "compare", "investor", "blackjack"],
  },
  {
    label: "Politics",
    emoji: "🏛️",
    color: 0x57f287,
    description: "Explore elections, parties, and government offices.",
    commands: [
      "elections",
      "election",
      "calendar",
      "predict",
      "party",
      "party-compare",
      "state",
      "government",
    ],
  },
  {
    label: "Economy",
    emoji: "💼",
    color: 0x3b82f6,
    description: "Corporations, markets, currencies, and industry sectors.",
    commands: [
      "corporation",
      "corpcompare",
      "bonds",
      "sectors",
      "marketshare",
      "stock-chart",
      "stockpick",
      "forex",
    ],
  },
  {
    label: "World",
    emoji: "📰",
    color: 0xfee75c,
    description: "In-game news and the game clock.",
    commands: ["news", "turn"],
  },
  {
    label: "Ask and Community",
    emoji: "💬",
    color: 0xeb459e,
    description: "Ask the game assistant, send feedback, and have some fun.",
    commands: ["ask", "ask-watches", "suggest", "improve", "tarot"],
  },
  {
    label: "Server",
    emoji: "🔑",
    color: 0x95a5a6,
    description: "Onboarding, support tickets, and bot info.",
    commands: [
      "accept",
      "ticket",
      "claim",
      "close-ticket",
      "copy-ticket",
      "help",
      "serverstats",
      "version",
    ],
  },
  {
    label: "Staff",
    emoji: "🛡️",
    color: 0xed4245,
    description: "Moderation and administration. Only shown to members with the permission.",
    staff: true,
    commands: [
      "merge-ticket",
      "ticket-panel",
      "reassess",
      "retriage",
      "backfill-tickets",
      "sync-ticket-perms",
      "sync-roles",
      "sync-supporters",
      "temp-sp-access",
      "strike",
      "supporter",
      "starboard",
      "filter",
      "ban-bot-channel-usage",
      "android-tester",
      "enable-bot",
      "disable-bot",
      "enable-accept",
      "disable-accept",
      "test",
    ],
  },
];

/** Commands that carry no permission gate in Discord but are staff tools in practice. */
export const STAFF_BY_CONVENTION = new Set(["claim", "close-ticket", "copy-ticket", "test"]);

export const extras: Record<string, HelpExtras> = {
  profile: {
    examples: ["/profile name:John Smith", "/profile user:@RainFrog"],
    details:
      "Position, party, state, stats, and corporate roles, with a link to the profile page. Omit all options to look up yourself.",
  },
  leaderboard: {
    examples: ["/leaderboard", "/leaderboard metric:Favorability country:US limit:5"],
  },
  compare: { examples: ["/compare politician1:John Smith politician2:Jane Doe"] },
  investor: {
    examples: ["/investor name:John Smith", "/investor user:@RainFrog", "/investor"],
    details: "Omit all options to look up yourself.",
  },
  blackjack: {
    examples: ["/blackjack pool", "/blackjack play wager:1000"],
    details:
      "The wager is deducted when the hand starts and resolved when it ends. Natural blackjack pays 3:2.",
  },
  elections: { examples: ["/elections", "/elections country:US state:CA"] },
  election: {
    examples: [
      "/election country:US state:CA race:Senate",
      "/election country:UK state:UK_SCO race:Commons",
      "/election country:US",
    ],
    details: "Omit state and race to browse all elections for a country.",
  },
  calendar: { examples: ["/calendar", "/calendar country:US"] },
  predict: {
    examples: ["/predict country:US race:Senate", "/predict country:UK race:Commons"],
  },
  party: {
    examples: ["/party id:1 country:UK", "/party id:2 country:US currency:EUR"],
    details: "The id is the party's number in that country, shown on its party page.",
  },
  "party-compare": {
    examples: ["/party-compare party1:1 country1:US party2:2 country2:US"],
  },
  state: { examples: ["/state id:CA", "/state id:UK_ENG"] },
  government: { examples: ["/government", "/government country:UK"] },
  corporation: {
    examples: ["/corporation name:Apex Media"],
    details: "Use the Bonds and Financials buttons on the result to switch tabs.",
  },
  corpcompare: {
    examples: [
      "/corpcompare corp1:Apex Media corp2:National Rail",
      "/corpcompare corp1:Apex Media corp2:National Rail corp3:Lunar Energy metric:Market Cap",
    ],
  },
  bonds: { examples: ["/bonds", "/bonds corp:Apex Media", "/bonds page:2"] },
  sectors: { examples: ["/sectors type:Technology", "/sectors type:Energy unowned:true"] },
  marketshare: { examples: ["/marketshare", "/marketshare country:US", "/marketshare state:US_CA"] },
  "stock-chart": { examples: ["/stock-chart", "/stock-chart corp:Apex Media"] },
  stockpick: { examples: ["/stockpick", "/stockpick limit:10 currency:EUR"] },
  forex: { examples: ["/forex"] },
  news: { examples: ["/news", "/news category:Elections"] },
  turn: { examples: ["/turn"] },
  ask: {
    examples: [
      "/ask question:Why did UK inflation rise?",
      "/ask question:Is it true the US treasury is empty? mode:Verify a claim",
    ],
    details:
      "Answers mechanics questions and live game data. Use /ask-watches to manage alerts you create by asking.",
  },
  "ask-watches": { examples: ["/ask-watches"] },
  suggest: { examples: ["/suggest"], details: "Pick a category and game system, then fill in the form." },
  improve: { examples: ["/improve prompt:make my bill description clearer"] },
  tarot: { examples: ["/tarot", "/tarot spread:Single Card"] },
  supporter: { examples: ["/supporter add name:John Smith"] },
  accept: { examples: ["/accept"], details: "Run once after reading the rules." },
  ticket: { examples: ["/ticket"], details: "Opens a private channel for the conversation." },
  claim: { examples: ["/claim"] },
  "close-ticket": {
    examples: ["/close-ticket"],
    details: "Opens a form for a resolution message; the opener is DMed it.",
  },
  "copy-ticket": { examples: ["/copy-ticket"] },
  help: { examples: ["/help", "/help command:party"] },
  serverstats: { examples: ["/serverstats type:Members days:7"] },
  version: { examples: ["/version"] },
  "merge-ticket": { examples: ["/merge-ticket ticket:42"] },
  "ticket-panel": { examples: ["/ticket-panel"] },
  starboard: { examples: ["/starboard channel:#starboard", "/starboard"] },
  strike: {
    examples: ["/strike add user:@johndoe reason:Spam", "/strike info", "/strike list"],
    details:
      "4 strikes per user, each expiring after 60 days. Anyone can view their own with /strike info.",
  },
  "temp-sp-access": {
    examples: ["/temp-sp-access user:@johndoe days:7"],
    details: "Default 30 days, max 90. Does not overwrite a permanent grant.",
  },
  "ban-bot-channel-usage": {
    examples: ["/ban-bot-channel-usage add channel:#general", "/ban-bot-channel-usage list"],
  },
};
