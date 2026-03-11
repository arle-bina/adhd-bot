import { Client, GatewayIntentBits, Collection, EmbedBuilder } from "discord.js";
import { validateEnv } from "./utils/env.js";
import * as profileCommand from "./commands/profile.js";
import * as leaderboardCommand from "./commands/leaderboard.js";
import * as partyCommand from "./commands/party.js";
import * as electionsCommand from "./commands/elections.js";
import * as stateCommand from "./commands/state.js";
import * as newsCommand from "./commands/news.js";
import * as acceptCommand from "./commands/accept.js";

validateEnv();

const WELCOME_CHANNEL_ID = "1470572208127475875";
const RULES_CHANNEL_ID = "1474142953437135142";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const commands = new Collection<string, typeof profileCommand>();
commands.set(profileCommand.data.name, profileCommand);
commands.set(leaderboardCommand.data.name, leaderboardCommand);
commands.set(partyCommand.data.name, partyCommand);
commands.set(electionsCommand.data.name, electionsCommand);
commands.set(stateCommand.data.name, stateCommand);
commands.set(newsCommand.data.name, newsCommand);
commands.set(acceptCommand.data.name, acceptCommand);

client.once("ready", () => {
  console.log(`Bot ready as ${client.user?.tag}`);
});

client.on("guildMemberAdd", async (member) => {
  try {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle("Welcome to the server!")
      .setDescription(
        `Hey ${member}! 👋\n\nWelcome to **${member.guild.name}**.\n\nPlease read the rules in <#${RULES_CHANNEL_ID}>, then run \`/accept\` in this channel to gain access to the rest of the server.`
      )
      .setColor(0x5865f2)
      .setThumbnail(member.user.displayAvatarURL());

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("guildMemberAdd error:", error);
  }
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
