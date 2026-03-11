import { REST, Routes } from "discord.js";
import { validateEnv } from "./utils/env.js";
import * as profileCommand from "./commands/profile.js";
import * as leaderboardCommand from "./commands/leaderboard.js";
import * as partyCommand from "./commands/party.js";
import * as electionsCommand from "./commands/elections.js";
import * as stateCommand from "./commands/state.js";
import * as newsCommand from "./commands/news.js";
import * as acceptCommand from "./commands/accept.js";

validateEnv();

const commands = [
  profileCommand.data.toJSON(),
  leaderboardCommand.data.toJSON(),
  partyCommand.data.toJSON(),
  electionsCommand.data.toJSON(),
  stateCommand.data.toJSON(),
  newsCommand.data.toJSON(),
  acceptCommand.data.toJSON(),
];

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN!);

async function main() {
  try {
    console.log("Registering slash commands...");

    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!), {
      body: commands,
    });

    console.log("Successfully registered commands.");
  } catch (error) {
    console.error(error);
  }
}

main();
