import { REST, Routes } from "discord.js";
import { validateEnv } from "./utils/env.js";
import * as profileCommand from "./commands/profile.js";

validateEnv();

const commands = [profileCommand.data.toJSON()];

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
