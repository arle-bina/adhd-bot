import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { ASK_MENTIONS } from "../utils/ask-safety.js";
import { deleteAskWatch, listAskWatches, type AskWatch } from "../utils/ask-watches.js";

export const data = new SlashCommandBuilder()
  .setName("ask-watches")
  .setDescription("See and remove your Ask watchlist alerts")
  .setDMPermission(false);

const HOW_TO = "Create one by asking, for example `/ask question: watch USD/GBP above 1.30` or `/ask question: tell me about new US bills`. Alerts arrive by DM.";

function describe(watches: AskWatch[], limit?: number): string {
  if (!watches.length) return `You have no Ask watches.\n${HOW_TO}`;
  const lines = watches.slice(0, 10).map((watch, index) => {
    const fired = watch.lastFiredAt ? `, last alert <t:${Math.floor(new Date(watch.lastFiredAt).getTime() / 1000)}:R>` : "";
    return `${index + 1}. ${String(watch.label).slice(0, 150)}${fired}`;
  });
  const cap = typeof limit === "number" ? ` (${watches.length} of ${limit})` : "";
  return [`**Your Ask watches${cap}**`, ...lines, "", HOW_TO].join("\n");
}

function rows(watches: AskWatch[], disabled = false): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = watches.slice(0, 10).map((watch, index) => new ButtonBuilder()
    .setCustomId(`ask-watch-del:${String(watch.id).slice(0, 60)}`)
    .setLabel(`Remove ${index + 1}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled));
  const out: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) out.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  return out;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  let state: { watches: AskWatch[]; limit?: number };
  try {
    state = await listAskWatches(interaction.user.id);
  } catch (error) {
    console.error("[ask] watch list failed:", error instanceof Error ? error.message : String(error));
    await interaction.editReply({ content: "Ask watches are unavailable right now. Try again later.", allowedMentions: ASK_MENTIONS });
    return;
  }
  const message = await interaction.editReply({ content: describe(state.watches, state.limit), components: rows(state.watches), allowedMentions: ASK_MENTIONS });
  if (!state.watches.length) return;

  const collector = message.createMessageComponentCollector({ time: 10 * 60_000 });
  collector.on("collect", async button => {
    if (button.user.id !== interaction.user.id) return;
    const id = button.customId.slice("ask-watch-del:".length);
    let ok = false;
    try {
      ok = await deleteAskWatch(interaction.user.id, id);
    } catch { /* reported below */ }
    if (ok) state = { ...state, watches: state.watches.filter(watch => String(watch.id).slice(0, 60) !== id) };
    await button.update({
      content: ok ? describe(state.watches, state.limit) : `${describe(state.watches, state.limit)}\n\nThat watch could not be removed. Try again.`,
      components: rows(state.watches),
      allowedMentions: ASK_MENTIONS,
    });
  });
  collector.on("end", async () => {
    try { await interaction.editReply({ components: rows(state.watches, true) }); } catch { /* expired */ }
  });
}
