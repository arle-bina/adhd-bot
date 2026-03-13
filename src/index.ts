import {
  Client,
  GatewayIntentBits,
  Collection,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { validateEnv } from "./utils/env.js";
import { buildCategoryEmbed, buildSelectMenu } from "./commands/help.js";
import { checkCooldown } from "./utils/cooldown.js";
import { errorMessage, replyWithError } from "./utils/helpers.js";

validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Command {
  data: { name: string };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  cooldown?: number;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const commands = new Collection<string, Command>();

const commandFiles = readdirSync(join(__dirname, "commands")).filter(
  (f) => f.endsWith(".js") || f.endsWith(".ts")
);

for (const file of commandFiles) {
  const baseName = file.replace(/\.(js|ts)$/, "");
  const mod = await import(`./commands/${baseName}.js`);
  if (mod.data && mod.execute) {
    commands.set(mod.data.name, mod as Command);
  }
}

client.once("ready", () => {
  console.log(`Bot ready as ${client.user?.tag} — ${commands.size} commands loaded`);
});

client.on("guildMemberAdd", async (member) => {
  try {
    const channel = member.guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID!);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle("Welcome to the server!")
      .setDescription(
        `Hey ${member}! 👋\n\nWelcome to **${member.guild.name}**.\n\nPlease read the rules in <#${process.env.RULES_CHANNEL_ID}>, then run \`/accept\` in this channel to gain access to the rest of the server.`
      )
      .setColor(0x5865f2)
      .setThumbnail(member.user.displayAvatarURL());

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("guildMemberAdd error:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isStringSelectMenu() && interaction.customId === "help_category") {
    const embed = buildCategoryEmbed(interaction.values[0]);
    if (!embed) return;
    await interaction.update({ embeds: [embed], components: [buildSelectMenu()] });
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  const remaining = checkCooldown(
    interaction.user.id,
    interaction.commandName,
    command.cooldown ?? 3
  );
  if (remaining > 0) {
    await interaction.reply({
      content: `Please wait **${remaining}s** before using \`/${interaction.commandName}\` again.`,
      ephemeral: true,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    // If the interaction hasn't been deferred yet, defer it so replyWithError
    // can use editReply (embeds require a deferred or replied interaction).
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({ ephemeral: true });
      }
      await replyWithError(interaction, interaction.commandName, error);
    } catch (replyError) {
      // Last resort: if even the error embed fails, send plain text
      console.error("Failed to send error embed:", replyError);
      const summary = errorMessage(error);
      const fallback = {
        content: `**/${interaction.commandName}** failed: ${summary.slice(0, 300)}`,
        ephemeral: true,
      };
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(fallback);
        } else {
          await interaction.reply(fallback);
        }
      } catch {
        // Nothing more we can do
      }
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
