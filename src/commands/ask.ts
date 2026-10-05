import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { linkedCharacterNames } from "../utils/ask-context.js";
import { runAskFlow, safePayload } from "../utils/ask-flow.js";
import type { AskMode } from "../utils/ask-runtime.js";
import { ASK_MAX_QUESTION, acquireAskSlot, askChannelAllowed, askChannelHint } from "../utils/ask-safety.js";

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Ask about AHD mechanics or live game data")
  .setDMPermission(false)
  .addStringOption((opt) =>
    opt
      .setName("question")
      .setDescription("What do you want to know?")
      .setRequired(true)
      .setMaxLength(ASK_MAX_QUESTION)
  )
  .addStringOption((opt) =>
    opt
      .setName("mode")
      .setDescription("How Ask should approach it. Defaults to automatic")
      .addChoices(
        { name: "Automatic", value: "auto" },
        { name: "Verify a claim", value: "verify" },
        { name: "Autopsy: why did this happen", value: "autopsy" },
        { name: "Scenario: what if", value: "scenario" },
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("response_length")
      .setDescription("How much detail? Defaults to concise")
      .addChoices(
        { name: "Concise", value: "concise" },
        { name: "Standard", value: "standard" },
        { name: "Detailed", value: "detailed" },
      )
  )
  .addBooleanOption((opt) =>
    opt
      .setName("live_data")
      .setDescription("Read live game state when useful (uses a live-data question). Defaults to on")
  )
  .addBooleanOption((opt) =>
    opt
      .setName("private")
      .setDescription("Only you see the answer")
  )
  .addStringOption((opt) =>
    opt
      .setName("character")
      .setDescription("Which of your characters the question is about")
      .setAutocomplete(true)
      .setMaxLength(120)
  )
  .addUserOption((opt) =>
    opt
      .setName("user")
      .setDescription("Discord user whose linked game profile the question is about")
      .setRequired(false)
  );

const MODES = new Set<AskMode>(["auto", "verify", "autopsy", "scenario"]);

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = String(interaction.options.getFocused() || "").toLowerCase();
  const names = await linkedCharacterNames(interaction.user.id);
  await interaction.respond(
    names
      .filter(name => !focused || name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(name => ({ name: name.slice(0, 100), value: name.slice(0, 100) })),
  );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString("question", true).trim();
  const modeOption = interaction.options.getString("mode") as AskMode | null;
  const mode: AskMode = modeOption && MODES.has(modeOption) ? modeOption : "auto";
  const isPrivate = interaction.options.getBoolean("private") ?? false;
  const isStaff = Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages));

  if (!isPrivate && !askChannelAllowed(interaction.channelId, isStaff)) {
    await interaction.reply({ content: askChannelHint() || "Ask isn't available in this channel.", ephemeral: true });
    return;
  }
  const gate = acquireAskSlot(interaction.user.id);
  if (!gate.ok) {
    await interaction.reply({ content: gate.message, ephemeral: true });
    return;
  }

  try {
    // Defer immediately to get the full interaction window, then replace the
    // native spinner with a message that survives on every Discord client.
    await interaction.deferReply({ ephemeral: isPrivate });
    const placeholder = (payload: Parameters<typeof safePayload>[0]) => interaction.editReply(safePayload(payload));
    await placeholder("Thinking…");
    await runAskFlow({
      user: interaction.user,
      channelId: interaction.channelId,
      question,
      responseLength: interaction.options.getString("response_length") ?? "concise",
      mode,
      useMcp: interaction.options.getBoolean("live_data") ?? true,
      isPrivate,
      characterName: interaction.options.getString("character"),
      subjectUser: interaction.options.getUser("user"),
      scopeId: interaction.id,
      placeholder,
      more: payload => interaction.followUp({ ...safePayload(payload), ephemeral: isPrivate }),
      privateSink: isPrivate ? null : () => ({
        first: payload => interaction.followUp({ ...safePayload(payload), ephemeral: true }),
        more: payload => interaction.followUp({ ...safePayload(payload), ephemeral: true }),
      }),
    });
  } finally {
    gate.release();
  }
}
