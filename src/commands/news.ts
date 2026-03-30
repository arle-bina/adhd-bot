import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { getNews } from "../utils/api.js";
import { replyWithError } from "../utils/helpers.js";

const categoryNames: Record<string, string> = {
  election: "Elections",
  legislation: "Legislation",
  executive: "Executive",
  general: "General",
};

const PAGE_SIZE = 5;

export const cooldown = 5;

export const data = new SlashCommandBuilder()
  .setName("news")
  .setDescription("Show the latest in-game news")
  .addStringOption((option) =>
    option
      .setName("category")
      .setDescription("Filter by news category")
      .setRequired(false)
      .addChoices(
        { name: "Elections", value: "election" },
        { name: "Legislation", value: "legislation" },
        { name: "Executive", value: "executive" },
        { name: "General", value: "general" }
      )
  );

type NewsPost = {
  id: string;
  title: string | null;
  content: string;
  authorName: string;
  isSystem: boolean;
  category: string | null;
  stateId: string | null;
  reactions: { agree: number; disagree: number };
  createdAt: string;
  postUrl: string;
};

const categoryLabels: Record<string, string> = {
  election: "[Election]",
  legislation: "[Legislation]",
  executive: "[Executive]",
  general: "[General]",
};

function buildNewsEmbed(
  posts: NewsPost[],
  page: number,
  totalPages: number,
  category: string | undefined,
): EmbedBuilder {
  const titleSuffix = category ? ` — ${categoryNames[category] ?? category}` : "";
  const embed = new EmbedBuilder()
    .setTitle(`📰 Latest News${titleSuffix}`)
    .setColor(0xfee75c);

  const slice = posts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  for (const post of slice) {
    const catTag = post.category ? (categoryLabels[post.category] ?? "") + " " : "";
    const stateTag = post.stateId ? ` -- ${post.stateId}` : "";
    const fieldName = (
      catTag + (post.title ?? post.authorName) + stateTag + (post.isSystem ? " [SYSTEM]" : "")
    ).slice(0, 256);
    const ts = Math.floor(new Date(post.createdAt).getTime() / 1000);
    const footer = `\n👍 ${post.reactions.agree}  👎 ${post.reactions.disagree}  · <t:${ts}:R>  · [Read more](${post.postUrl})`;
    const maxContentLen = Math.max(0, 1024 - footer.length);
    const content =
      post.content.length > maxContentLen
        ? post.content.slice(0, Math.max(0, maxContentLen - 1)) + "…"
        : post.content;
    embed.addFields({ name: fieldName, value: (content + footer).slice(0, 1024) });
  }

  if (totalPages > 1) {
    embed.setFooter({ text: `Page ${page + 1} of ${totalPages} · ahousedividedgame.com` });
  } else {
    embed.setFooter({ text: "ahousedividedgame.com" });
  }

  return embed;
}

function buildPageRow(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("news_prev")
      .setLabel("← Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("news_next")
      .setLabel("Next →")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const category = interaction.options.getString("category") ?? undefined;

  await interaction.deferReply();

  try {
    // Fetch the max 10 items so pagination has something to page through
    const result = await getNews({ category, limit: 10 });

    if (!result.found || result.posts.length === 0) {
      await interaction.editReply({ content: "No news posts found." });
      return;
    }

    const posts = result.posts;
    const totalPages = Math.ceil(posts.length / PAGE_SIZE);
    let page = 0;

    if (totalPages <= 1) {
      // No pagination needed
      await interaction.editReply({ embeds: [buildNewsEmbed(posts, 0, 1, category)] });
      return;
    }

    const message = await interaction.editReply({
      embeds: [buildNewsEmbed(posts, page, totalPages, category)],
      components: [buildPageRow(page, totalPages)],
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 90_000,
    });

    collector.on("collect", async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: "This isn't your news feed.", ephemeral: true });
        return;
      }
      await btn.deferUpdate();
      if (btn.customId === "news_prev") page = Math.max(0, page - 1);
      if (btn.customId === "news_next") page = Math.min(totalPages - 1, page + 1);
      await btn.editReply({
        embeds: [buildNewsEmbed(posts, page, totalPages, category)],
        components: [buildPageRow(page, totalPages)],
      });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  } catch (error) {
    await replyWithError(interaction, "news", error);
  }
}
