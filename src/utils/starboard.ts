import {
  EmbedBuilder,
  type Guild,
  type MessageReaction,
  type TextChannel,
  type Message,
} from "discord.js";
import {
  getConfig,
  getStarboardPostId,
  setStarboardPostId,
  removeStarboardPostId,
} from "./starboardStore.js";

/** Resolve the emoji identifier used for comparison. */
function reactionMatchesConfig(reaction: MessageReaction, configEmoji: string): boolean {
  const emoji = reaction.emoji;
  // Custom emoji: config stores "<:name:id>" or "<a:name:id>", reaction has .id
  const customMatch = configEmoji.match(/^<a?:\w+:(\d+)>$/);
  if (customMatch) {
    return emoji.id === customMatch[1];
  }
  // Unicode emoji: compare the emoji name/character directly
  return emoji.name === configEmoji;
}

/** Count qualifying reactions (respecting selfStar setting). */
function countStars(reaction: MessageReaction, authorId: string, selfStar: boolean): number {
  const count = reaction.count ?? 0;
  if (selfStar) return count;
  // If self-star is disabled, check if the author reacted and subtract 1
  const authorReacted = reaction.users.cache.has(authorId);
  return authorReacted ? count - 1 : count;
}

/** Build the starboard embed for a message. */
function buildStarboardEmbed(message: Message, starCount: number, emoji: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setAuthor({
      name: message.author.displayName,
      iconURL: message.author.displayAvatarURL(),
    })
    .setTimestamp(message.createdAt)
    .setFooter({ text: `${emoji} ${starCount} | #${(message.channel as TextChannel).name}` });

  // Message text content
  if (message.content) {
    embed.setDescription(message.content.slice(0, 4096));
  }

  // Handle images: attachments and embed images
  const imageUrl = getFirstImage(message);
  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  // If message is a reply, note what it's replying to
  if (message.reference?.messageId) {
    const jumpUrl = `https://discord.com/channels/${message.guild!.id}/${message.channel.id}/${message.reference.messageId}`;
    const replyNote = `[Replying to a message](${jumpUrl})`;
    const existing = embed.data.description ?? "";
    embed.setDescription(existing ? `${replyNote}\n\n${existing}` : replyNote);
  }

  // Add a link to the original message
  const jumpLink = `[Jump to message](${message.url})`;
  const existing = embed.data.description ?? "";
  embed.setDescription(existing ? `${existing}\n\n${jumpLink}` : jumpLink);

  // Handle additional images beyond the first as fields
  const additionalImages = getAllImages(message).slice(1);
  if (additionalImages.length > 0) {
    embed.addFields({
      name: "Additional Attachments",
      value: additionalImages.map((url, i) => `[Attachment ${i + 2}](${url})`).join("\n").slice(0, 1024),
    });
  }

  // Handle video attachments
  const videos = message.attachments.filter((a) => a.contentType?.startsWith("video/"));
  if (videos.size > 0) {
    const videoLinks = videos.map((v) => `[${v.name}](${v.url})`).join("\n");
    embed.addFields({ name: "Videos", value: videoLinks.slice(0, 1024) });
  }

  return embed;
}

/** Get the first image URL from attachments or embeds. */
function getFirstImage(message: Message): string | null {
  // Check attachments first
  const imageAttachment = message.attachments.find((a) =>
    a.contentType?.startsWith("image/"),
  );
  if (imageAttachment) return imageAttachment.url;

  // Check embed images
  for (const embed of message.embeds) {
    if (embed.image?.url) return embed.image.url;
    if (embed.thumbnail?.url) return embed.thumbnail.url;
  }

  // Check for image URLs in content
  const urlMatch = message.content.match(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/i);
  if (urlMatch) return urlMatch[0];

  return null;
}

/** Get all image URLs from the message. */
function getAllImages(message: Message): string[] {
  const images: string[] = [];

  for (const attachment of message.attachments.values()) {
    if (attachment.contentType?.startsWith("image/")) {
      images.push(attachment.url);
    }
  }

  for (const embed of message.embeds) {
    if (embed.image?.url) images.push(embed.image.url);
    else if (embed.thumbnail?.url) images.push(embed.thumbnail.url);
  }

  return images;
}

/** Handle a reaction add or remove — create, update, or delete the starboard post. */
export async function handleStarboardReaction(
  reaction: MessageReaction,
  guild: Guild,
): Promise<void> {
  const config = getConfig(guild.id);
  if (!config || !config.enabled) return;

  // Only process the configured emoji
  if (!reactionMatchesConfig(reaction, config.emoji)) return;

  const message = reaction.message as Message;

  // Don't star messages from the starboard channel itself (prevents loops)
  if (message.channel.id === config.channelId) return;

  // Don't star bot messages
  if (message.author.bot) return;

  const starCount = countStars(reaction, message.author.id, config.selfStar);
  const existingPostId = getStarboardPostId(guild.id, message.id);

  const starboardChannel = guild.channels.cache.get(config.channelId) as TextChannel | undefined;
  if (!starboardChannel) return;

  if (starCount >= config.threshold) {
    const embed = buildStarboardEmbed(message, starCount, config.emoji);
    const content = `${config.emoji} **${starCount}** | <#${message.channel.id}>`;

    if (existingPostId) {
      // Update existing starboard post
      try {
        const post = await starboardChannel.messages.fetch(existingPostId);
        await post.edit({ content, embeds: [embed] });
      } catch {
        // Post was deleted — create a new one
        const newPost = await starboardChannel.send({ content, embeds: [embed] });
        setStarboardPostId(guild.id, message.id, newPost.id);
      }
    } else {
      // Create new starboard post
      const post = await starboardChannel.send({ content, embeds: [embed] });
      setStarboardPostId(guild.id, message.id, post.id);
    }
  } else if (existingPostId) {
    // Stars dropped below threshold — remove the post
    try {
      const post = await starboardChannel.messages.fetch(existingPostId);
      await post.delete();
    } catch {
      // Already gone
    }
    removeStarboardPostId(guild.id, message.id);
  }
}
