import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const HERMES_BIN = "/usr/local/lib/hermes-agent/venv/bin/hermes";

const STYLE_CHOICES = [
  { name: "Clear & Concise", value: "clear" },
  { name: "Detailed & Comprehensive", value: "detailed" },
  { name: "Creative & Engaging", value: "creative" },
  { name: "Technical & Precise", value: "technical" },
] as const;

const STYLE_INSTRUCTIONS: Record<string, string> = {
  clear: "Rewrite the prompt to be clearer, more specific, and more likely to get a good response. Keep it concise.",
  detailed:
    "Rewrite the prompt to be more detailed and comprehensive, adding context, constraints, and expected output format.",
  creative:
    "Rewrite the prompt to be more creative and engaging, using vivid language and interesting framing while preserving the core intent.",
  technical:
    "Rewrite the prompt to be technically precise, using correct terminology and specifying exact requirements.",
};

async function improveViaHermes(
  prompt: string,
  style: string
): Promise<string> {
  const instruction =
    STYLE_INSTRUCTIONS[style] ?? STYLE_INSTRUCTIONS.clear;
  const query = `You are a prompt improvement assistant. ${instruction} Return ONLY the improved prompt — no explanations, no preamble, no markdown formatting.\n\nPrompt to improve:\n${prompt}`;

  const { stdout } = await execFileAsync(HERMES_BIN, [
    "chat",
    "-q",
    query,
    "--quiet",
  ], {
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });

  const result = stdout.trim();
  if (!result) throw new Error("Empty response from AI");
  return result;
}

export const data = new SlashCommandBuilder()
  .setName("improve")
  .setDescription("Improve a prompt using AI")
  .addStringOption((o) =>
    o
      .setName("prompt")
      .setDescription("The prompt you want to improve")
      .setRequired(true)
      .setMaxLength(2000)
  )
  .addStringOption((o) =>
    o
      .setName("style")
      .setDescription("Improvement style (default: Clear & Concise)")
      .setRequired(false)
      .addChoices(...STYLE_CHOICES)
  )
  .setDMPermission(false);

export const cooldown = 10;

export async function execute(interaction: ChatInputCommandInteraction) {
  const originalPrompt = interaction.options.getString("prompt", true);
  const style = interaction.options.getString("style") ?? "clear";

  await interaction.deferReply();

  try {
    const improvedPrompt = await improveViaHermes(originalPrompt, style);

    const styleLabel =
      STYLE_CHOICES.find((c) => c.value === style)?.name ?? "Clear & Concise";

    // Discord embed field values cap at 1024 chars
    const originalTruncated =
      originalPrompt.length > 1024
        ? originalPrompt.slice(0, 1021) + "…"
        : originalPrompt;
    const improvedTruncated =
      improvedPrompt.length > 1024
        ? improvedPrompt.slice(0, 1021) + "…"
        : improvedPrompt;

    const embed = new EmbedBuilder()
      .setTitle("✨ Prompt Improved")
      .setColor(0x9b59b6)
      .addFields(
        { name: "Original", value: originalTruncated, inline: false },
        {
          name: `Improved (${styleLabel})`,
          value: improvedTruncated,
          inline: false,
        }
      )
      .setFooter({ text: "Powered by Hermes AI" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("Improve command error:", error);
    await interaction.editReply({
      content: `❌ Could not improve prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}