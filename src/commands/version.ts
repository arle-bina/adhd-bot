import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const START_TIME = Date.now();

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

function getLastDeployTime(): number | null {
  try {
    const isoStr = execSync("git log -1 --format=%cI HEAD", { encoding: "utf-8" }).trim();
    const ms = Date.parse(isoStr);
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
  } catch {
    return null;
  }
}

function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

export const data = new SlashCommandBuilder()
  .setName("version")
  .setDescription("Show the bot's current version, uptime, and last deploy");

export async function execute(interaction: ChatInputCommandInteraction) {
  const version = getVersion();
  const commit = getCommitHash();
  const uptime = formatUptime(Date.now() - START_TIME);
  const deployTs = getLastDeployTime();

  const embed = new EmbedBuilder()
    .setTitle("Bot Version")
    .setColor(0x5865f2)
    .addFields(
      { name: "Version", value: `v${version}`, inline: true },
      { name: "Commit", value: commit, inline: true },
      { name: "Uptime", value: uptime, inline: true },
      {
        name: "Last Deploy",
        value: deployTs ? `<t:${deployTs}:R>` : "unknown",
        inline: true,
      },
    )
    .setFooter({ text: "ahousedividedgame.com" });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
