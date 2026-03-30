import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  type AutocompleteInteraction,
} from "discord.js";
import { getCorporation, getCorporationList, type CorporationListItem } from "../utils/api.js";
import { replyWithError, standardFooter, hexToInt } from "../utils/helpers.js";
import { getWatchlist, addToWatchlist, removeFromWatchlist } from "../utils/watchlistStore.js";

// ---------------------------------------------------------------------------
// Corporation list cache (shared with bonds.ts pattern)
// ---------------------------------------------------------------------------

let cachedList: CorporationListItem[] = [];
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getList(): Promise<CorporationListItem[]> {
  if (Date.now() < cacheExpiry && cachedList.length > 0) return cachedList;
  const res = await getCorporationList();
  cachedList = res.corporations;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedList;
}

// ---------------------------------------------------------------------------
// Autocomplete — only for add/remove subcommands
// ---------------------------------------------------------------------------

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === "remove") {
      // Only suggest corps currently on the user's watchlist
      const list = getWatchlist(interaction.user.id);
      const filtered = list
        .filter((name) => name.toLowerCase().includes(focused))
        .slice(0, 25);
      await interaction.respond(filtered.map((name) => ({ name, value: name })));
      return;
    }

    // For "add", suggest from the full corporation list
    const list = await getList();
    const filtered = list
      .filter((c) => c.name.toLowerCase().includes(focused))
      .slice(0, 25);
    await interaction.respond(
      filtered.map((c) => ({ name: c.name, value: c.name }))
    );
  } catch {
    await interaction.respond([]);
  }
}

// ---------------------------------------------------------------------------
// Command definition
// ---------------------------------------------------------------------------

export const cooldown = 3;

export const data = new SlashCommandBuilder()
  .setName("watchlist")
  .setDescription("Track your favourite corporations")
  .addSubcommand((sub) =>
    sub
      .setName("view")
      .setDescription("View your watchlist with live stock data")
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a corporation to your watchlist")
      .addStringOption((o) =>
        o
          .setName("corp")
          .setDescription("Corporation name")
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a corporation from your watchlist")
      .addStringOption((o) =>
        o
          .setName("corp")
          .setDescription("Corporation name")
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "add") {
    const corpName = interaction.options.getString("corp", true);
    const result = addToWatchlist(interaction.user.id, corpName);
    if (!result.added) {
      await interaction.reply({ content: result.reason!, ephemeral: true });
    } else {
      await interaction.reply({
        content: `Added **${corpName}** to your watchlist.`,
        ephemeral: true,
      });
    }
    return;
  }

  if (sub === "remove") {
    const corpName = interaction.options.getString("corp", true);
    const removed = removeFromWatchlist(interaction.user.id, corpName);
    if (!removed) {
      await interaction.reply({
        content: `**${corpName}** isn't on your watchlist.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `Removed **${corpName}** from your watchlist.`,
        ephemeral: true,
      });
    }
    return;
  }

  // sub === "view"
  const list = getWatchlist(interaction.user.id);

  if (list.length === 0) {
    await interaction.reply({
      content:
        "Your watchlist is empty. Use `/watchlist add` to track corporations.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    // Fetch all corporations in parallel
    const results = await Promise.allSettled(
      list.map((name) => getCorporation(name))
    );

    const embed = new EmbedBuilder()
      .setTitle("📊 Your Watchlist")
      .setColor(0x5865f2);

    for (let i = 0; i < list.length; i++) {
      const name = list[i];
      const result = results[i];

      if (result.status === "rejected" || !result.value.found || !result.value.corporation) {
        embed.addFields({
          name,
          value: "Could not fetch data",
          inline: true,
        });
        continue;
      }

      const corp = result.value.corporation;
      const price = corp.sharePrice != null ? `$${corp.sharePrice.toFixed(2)}` : "N/A";
      const mktCap =
        corp.marketCapitalization != null
          ? `$${(corp.marketCapitalization / 1000).toFixed(1)}k`
          : "N/A";
      const dividend = corp.dividendRate > 0 ? `${(corp.dividendRate * 100).toFixed(1)}%` : "—";

      const lines = [
        `**Price:** ${price}`,
        `**Mkt Cap:** ${mktCap}`,
        `**Div Rate:** ${dividend}`,
        `**Type:** ${corp.typeLabel}`,
      ];

      embed.addFields({
        name: `${corp.name}`,
        value: lines.join("\n"),
        inline: true,
      });
    }

    embed.setFooter(standardFooter(`${list.length} corporation(s) tracked`));

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await replyWithError(interaction, "watchlist", error);
  }
}
