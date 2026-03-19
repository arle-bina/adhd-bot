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
    description: "Look up politicians and see how they rank.",
    commands: [
      {
        name: "/profile",
        usage: "/profile [name] [user]",
        description:
          "View a player's characters — position, party, state, and a direct link to their profile page.",
        examples: ["/profile name:John Smith", "/profile user:@RainFrog"],
      },
      {
        name: "/leaderboard",
        usage: "/leaderboard [metric] [country] [limit]",
        description:
          "Top politicians ranked by political influence or favorability. Filter by US or UK, show up to 25 results.",
        examples: [
          "/leaderboard",
          "/leaderboard metric:Favorability country:US limit:5",
        ],
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
          "Drill into a specific race — shows phase (upcoming/primary/general/ended), candidate standings, vote shares, and a link to the election page. Omit state and race to browse all elections for a country.",
        examples: [
          "/election country:US state:CA race:Senate",
          "/election country:UK state:UK_SCO race:Commons",
          "/election country:US",
        ],
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
        usage: "/party id:<slug>",
        description:
          "Look up a political party — ideology, membership count, treasury, and top politicians.",
        examples: ["/party id:labour", "/party id:republican"],
      },
      {
        name: "/state",
        usage: "/state id:<code>",
        description:
          "State or region overview — population, voting system (RCV or FPTP), and all current office holders.",
        examples: ["/state id:CA", "/state id:TX", "/state id:UK_ENG"],
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
        usage: "/news [category] [limit]",
        description:
          "Latest in-game news posts with reactions and timestamps. Filter by Elections, Legislation, Executive, or General.",
        examples: ["/news", "/news category:Elections limit:10"],
      },
      {
        name: "/turn",
        usage: "/turn",
        description:
          "Current game turn, year, and clock. Shows when the last turn processed and when the next one is due.",
        examples: ["/turn"],
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
          "Close the current ticket channel. Can be used by the ticket creator or moderators.",
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
          "Backfill party and country roles for all linked members. Requires Manage Roles permission.",
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
