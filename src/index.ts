import { Client, GatewayIntentBits, Collection } from "discord.js";
import { validateEnv } from "./utils/env.js";
import * as profileCommand from "./commands/profile.js";

validateEnv();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commands = new Collection<string, typeof profileCommand>();
commands.set(profileCommand.data.name, profileCommand);

client.once("ready", () => {
  console.log(`Bot ready as ${client.user?.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error("Command error:", error);
    const reply = {
      content: "There was an error executing this command.",
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
