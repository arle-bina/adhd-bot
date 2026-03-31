export interface CommandHelp {
  name: string;
  usage: string;
  description: string;
  examples: string[];
}

export interface Category {
  label: string;
  emoji: string;
  color: number;
  description: string;
  commands: CommandHelp[];
}

export const categories: Category[] = [
  {
    label: "Players",
    emoji: "👤",
    color: 0x5865f2,
    description: "Look up politicians, compare them, and see how they rank.",
    commands: [
      {
        name: "/profile",
        usage: "/profile [name] [user]",
        description:
          "View a player's character — position, party, state, stats, and corporate roles (CEO/investor). Links directly to their profile page.",
        examples: ["/profile name:John Smith", "/profile user:@RainFrog"],
      },
      {
        name: "/leaderboard",
        usage: "/leaderboard [metric] [country] [limit]",
        description:
          "Top politicians ranked by political influence, national influence, favorability, actions, or funds. Filter by US or UK, show up to 25 results.",
        examples: [
          "/leaderboard",
          "/leaderboard metric:Favorability country:US limit:5",
        ],
      },
      {
        name: "/compare",
        usage: "/compare politician1:<name> politician2:<name>",
        description:
          "Side-by-side comparison of two politicians — stats, policy positions, party, office, and corporate roles.",
        examples: [
          "/compare politician1:John Smith politician2:Jane Doe",
        ],
      },
      {
        name: "/investor",
        usage: "/investor [name] [user]",
        description:
          "Look up a politician's corporate positions — CEO role, investor rank, and portfolio value. Omit all options to look up yourself.",
        examples: ["/investor name:John Smith", "/investor user:@RainFrog", "/investor"],
      },
    ],
  },
  {
    label: "Politics",
    emoji: "🏛️",
    color: 0x57f287,
    description: "Explore elections, parties, and government offices.",
    commands: [
      {
        name: "/elections",
        usage: "/elections [country] [state]",
        description:
          "Active and upcoming elections with candidate lists and live Discord countdowns.",
        examples: ["/elections", "/elections country:US state:CA"],
      },
      {
        name: "/election",
        usage: "/election country:<US|UK> [state] [race]",
        description:
          "Drill into a specific race — shows phase (upcoming/primary/general/ended), candidate standings, vote shares, electoral votes, and a link to the election page. Omit state and race to browse all elections for a country.",
        examples: [
          "/election country:US state:CA race:Senate",
          "/election country:UK state:UK_SCO race:Commons",
          "/election country:US",
        ],
      },
      {
        name: "/calendar",
        usage: "/calendar [country]",
        description:
          "Election calendar — shows all active and upcoming elections grouped by status, alongside the current game turn and clock so you know when races will resolve.",
        examples: ["/calendar", "/calendar country:US"],
      },
      {
        name: "/predict",
        usage: "/predict country:<country> race:<chamber>",
        description:
          "Projected seat totals for a legislative chamber, with a parliament chart. Shows current seats vs predicted outcome during active elections.",
        examples: ["/predict country:US race:Senate", "/predict country:UK race:Commons"],
      },
      {
        name: "/party",
        usage: "/party id:<slug> country:<US|UK>",
        description:
          "Look up a political party — ideology, membership count, treasury, chair, and top politicians.",
        examples: ["/party id:labour country:UK", "/party id:republican country:US"],
      },
      {
        name: "/party-compare",
        usage: "/party-compare party1:<slug> country1:<US|UK> party2:<slug> country2:<US|UK>",
        description:
          "Side-by-side comparison of two parties — ideology positions (with visual bars), membership, treasury, chair, and top members.",
        examples: [
          "/party-compare party1:republican country1:US party2:democrat country2:US",
          "/party-compare party1:labour country1:UK party2:conservative country2:UK",
        ],
      },
      {
        name: "/state",
        usage: "/state id:<code>",
        description:
          "State or region overview — population, voting system (RCV or FPTP), and all current office holders.",
        examples: ["/state id:CA", "/state id:TX", "/state id:UK_ENG"],
      },
      {
        name: "/government",
        usage: "/government [country]",
        description:
          "View the current government of a country — executives, congressional leadership, and cabinet members. Defaults to US.",
        examples: ["/government", "/government country:UK", "/government country:DE"],
      },
    ],
  },
  {
    label: "Economy",
    emoji: "💼",
    color: 0x3b82f6,
    description: "Track corporations and industry sectors.",
    commands: [
      {
        name: "/corporation",
        usage: "/corporation name:<name>",
        description:
          "Look up a corporation with tabbed views. Overview (default) shows type, HQ, CEO, capital, shares, revenue, costs, shareholders, and sectors. Use the Bonds and Financials buttons to switch tabs.",
        examples: [
          "/corporation name:Apex Media",
          "/corporation name:National Rail",
        ],
      },
      {
        name: "/bonds",
        usage: "/bonds [corp] [page]",
        description:
          "Browse the bond market — all active bonds across corporations with coupon rates, prices, yields, and maturity. Filter by corporation name (autocomplete). Paginated.",
        examples: ["/bonds", "/bonds corp:Apex Media", "/bonds page:2"],
      },
      {
        name: "/sectors",
        usage: "/sectors type:<industry> [unowned] [page]",
        description:
          "Browse sector ownership by industry type — revenue, growth rate, and worker count per state. Toggle unowned to see untapped market.",
        examples: [
          "/sectors type:Technology",
          "/sectors type:Energy unowned:true",
          "/sectors type:Media page:2",
        ],
      },
    ],
  },
  {
    label: "World",
    emoji: "📰",
    color: 0xfee75c,
    description: "Stay up to date with in-game events and news.",
    commands: [
      {
        name: "/news",
        usage: "/news [category]",
        description:
          "Latest in-game news posts with reactions and timestamps. Filter by Elections, Legislation, Executive, or General. Up to 10 posts shown with Prev/Next pagination.",
        examples: ["/news", "/news category:Elections"],
      },
      {
        name: "/turn",
        usage: "/turn",
        description:
          "Current game turn, year, and clock. Shows when the last turn processed and when the next one is due.",
        examples: ["/turn"],
      },
      {
        name: "/calendar",
        usage: "/calendar [country]",
        description:
          "Election calendar — all active and upcoming elections with the game clock for context.",
        examples: ["/calendar", "/calendar country:UK"],
      },
    ],
  },
  {
    label: "Server",
    emoji: "🔑",
    color: 0xeb459e,
    description: "Server management and onboarding.",
    commands: [
      {
        name: "/accept",
        usage: "/accept",
        description:
          "Accept the server rules and gain full access. Run this once after reading the rules in the welcome channel.",
        examples: ["/accept"],
      },
      {
        name: "/ticket",
        usage: "/ticket",
        description:
          "Open a support ticket — choose Bug Report, Suggestion, or Moderation Issue. A private channel will be created for the conversation.",
        examples: ["/ticket"],
      },
      {
        name: "/help",
        usage: "/help",
        description: "Browse all bot commands using this interactive menu.",
        examples: ["/help"],
      },
      {
        name: "/serverstats",
        usage: "/serverstats type:<messages|members> [days]",
        description:
          "View server activity over time as a graph. Messages shows daily count and cumulative total. Members shows member count trend.",
        examples: [
          "/serverstats type:Messages",
          "/serverstats type:Members days:7",
          "/serverstats type:Messages days:90",
        ],
      },
      {
        name: "/starboard",
        usage: "/starboard [channel] [threshold] [emoji] [self-star] [enabled]",
        description:
          "Configure the starboard — messages that earn enough star reactions are reposted to a dedicated channel. Requires Manage Server permission. Run with no options to view current config.",
        examples: [
          "/starboard channel:#starboard",
          "/starboard threshold:5 emoji:🌟",
          "/starboard enabled:false",
          "/starboard",
        ],
      },
      {
        name: "/close-ticket",
        usage: "/close-ticket",
        description:
          "Close the current ticket channel. Opens a form for a resolution message; staff closing someone else's ticket must fill it so the opener gets a DM.",
        examples: ["/close-ticket"],
      },
      {
        name: "/ticket-panel",
        usage: "/ticket-panel",
        description:
          "Post a persistent ticket panel with buttons in the current channel. Requires Manage Channels permission.",
        examples: ["/ticket-panel"],
      },
      {
        name: "/sync-roles",
        usage: "/sync-roles",
        description:
          "Backfill party, office, and country roles for all linked members. Requires Manage Roles permission. This processes all members in batches and may take a moment.",
        examples: ["/sync-roles"],
      },
      {
        name: "/version",
        usage: "/version",
        description:
          "Show the bot's current version, commit hash, uptime, and last deploy time.",
        examples: ["/version"],
      },
    ],
  },
];
