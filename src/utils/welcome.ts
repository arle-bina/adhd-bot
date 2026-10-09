/**
 * The #welcome post for a new member.
 *
 * Two parts: a rendered card greeting the member by avatar and name, and an
 * embed under it that tells them what the game is, how to get into the server,
 * how to register, and how to link an existing account. Linking is optional,
 * but it is what lets role sync and /profile find their character, so the
 * embed asks for it.
 *
 * If the card cannot render (renderer queue full, canvas failure) the post
 * still goes out with the avatar as an embed thumbnail. A join must never go
 * unwelcomed because of an image.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type GuildMember,
  type MessageCreateOptions,
} from "discord.js";
import { normalizeGameUrl, standardFooter } from "./helpers.js";
import { chartAttachment } from "./viz/attach.js";
import { BRAND, hexToInt } from "./viz/theme.js";
import { renderWelcomeCard } from "./viz/welcome.js";

export interface WelcomeLinks {
  site: string;
  register: string;
  settings: string;
}

export function welcomeLinks(): WelcomeLinks {
  return {
    site: normalizeGameUrl("/"),
    register: normalizeGameUrl("/register"),
    settings: normalizeGameUrl("/settings"),
  };
}

/** The getting-started embed. Pure, so the copy can be tested without a guild. */
export function buildWelcomeEmbed(rulesChannelId: string | undefined, links: WelcomeLinks): EmbedBuilder {
  const rules = rulesChannelId ? `<#${rulesChannelId}>` : "the rules channel";
  return new EmbedBuilder()
    .setColor(hexToInt(BRAND.primary))
    .setTitle("Getting started")
    .setDescription(
      "**A House Divided** is a multiplayer political simulation. Build a politician, " +
        "campaign, win office, pass legislation and run the economy alongside real players " +
        "in a persistent world.",
    )
    .addFields(
      {
        name: "1. Unlock the server",
        value: `Read the rules in ${rules}, then run \`/accept\` in this channel.`,
      },
      {
        name: "2. New to the game? Register",
        value:
          `Create an account at [ahousedividedgame.com](${links.register}), then make your ` +
          "character: pick a home state and a party and start building influence. " +
          "Signing up with Discord links your account here automatically.",
      },
      {
        name: "Already playing? Link your account",
        value:
          `Optional, but encouraged. Open [Settings](${links.settings}) on the site and connect ` +
          "Discord. Linking gives you your in-game roles here and lets `/profile` and the other " +
          "bot commands find your character.",
      },
    )
    .setFooter(standardFooter());
}

export function buildWelcomeButtons(links: WelcomeLinks): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Play").setURL(links.site),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Register").setURL(links.register),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Link your account").setURL(links.settings),
  );
}

/**
 * Build the full welcome post. The mention lives in `content` because a name
 * drawn into an image does not ping, and the ping is what pulls a new member's
 * eye to the channel.
 */
export async function buildWelcomeMessage(member: GuildMember): Promise<MessageCreateOptions> {
  const links = welcomeLinks();
  const embed = buildWelcomeEmbed(process.env.RULES_CHANNEL_ID, links);
  const base: MessageCreateOptions = {
    content: `Welcome, ${member}!`,
    embeds: [embed],
    components: [buildWelcomeButtons(links)],
    allowedMentions: { users: [member.id] },
  };

  try {
    const png = await renderWelcomeCard({
      displayName: member.displayName,
      username: member.user.username,
      // node-canvas cannot decode WebP or animated GIF, Discord's defaults.
      avatarUrl: member.displayAvatarURL({ extension: "png", forceStatic: true, size: 256 }),
      memberNumber: member.guild.memberCount,
      footerLeft: member.guild.name,
    });
    const card = chartAttachment(png, "welcome", member.id);
    return { ...base, files: [card.file] };
  } catch (error) {
    console.error("Welcome card render failed:", error);
    embed.setThumbnail(member.displayAvatarURL());
    return base;
  }
}
