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
        name: "/help",
        usage: "/help",
        description: "Browse all bot commands using this interactive menu.",
        examples: ["/help"],
      },
    ],
  },
];
