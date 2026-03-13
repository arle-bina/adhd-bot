import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  const pkgPath = join(__dirname, "..", "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
  return pkg.version;
}

function getCommitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

export const data = new SlashCommandBuilder()
  .setName("version")
  .setDescription("Show the bot's current version and commit ID");

export async function execute(interaction: ChatInputCommandInteraction) {
  const version = getVersion();
  const commit = getCommitHash();

  const embed = new EmbedBuilder()
    .setTitle("Bot Version")
    .setColor(0x5865f2)
    .addFields(
      { name: "Version", value: `v${version}`, inline: true },
      { name: "Commit", value: commit, inline: true },
    )
    .setFooter({ text: "ahousedividedgame.com" });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
