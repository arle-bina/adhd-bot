import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { getNews } from "../utils/api.js";
import { errorMessage } from "../utils/helpers.js";

const categoryNames: Record<string, string> = {
  election: "Elections",
  legislation: "Legislation",
  executive: "Executive",
  general: "General",
};

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
  )
  .addIntegerOption((option) =>
    option
      .setName("limit")
      .setDescription("Number of posts to show (max 10, default 5)")
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(10)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const category = interaction.options.getString("category") ?? undefined;
  const limit = interaction.options.getInteger("limit") ?? 5;

  try {
    const result = await getNews({ category, limit });

    if (!result.found || result.posts.length === 0) {
      await interaction.reply({ content: "No news posts found.", ephemeral: true });
      return;
    }

    const titleSuffix = category ? ` — ${categoryNames[category] ?? category}` : "";
    const embed = new EmbedBuilder()
      .setTitle(`📰 Latest News${titleSuffix}`)
      .setColor(0xfee75c);

    for (const post of result.posts) {
      const fieldName = (
        (post.title ?? post.authorName) + (post.isSystem ? " [SYSTEM]" : "")
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

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error("News error:", error);
    const errReply = { content: errorMessage(error), ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errReply);
    } else {
      await interaction.reply(errReply);
    }
  }
}
