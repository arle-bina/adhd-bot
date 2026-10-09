import {
  Guild,
  GuildMember,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
  type MessageReaction,
  type ModalSubmitInteraction,
  type User,
} from "discord.js";
import {
  type TicketCategory,
  type Ticket,
  addTicket,
  removeTicket,
  claimTicket,
  getTicketByChannel,
  getTicketByNumber,
  getTicketNumberFloor,
  setTicketNumberFloor,
  getCategoryId,
  setCategoryId,
  isPanel,
  getTickets,
  MAX_TICKETS_PER_CATEGORY,
} from "./ticketStore.js";
import {
  formatTicketPlatform,
  type TicketPlatform,
  TICKET_PLATFORMS,
} from "./ticketPlatform.js";
import {
  createTicket as apiCreateTicket,
  reserveTicketNumber as apiReserveTicketNumber,
  getTicketReceiptUrl,
  getTicketIntakeContext,
  updateTicket as apiUpdateTicket,
  type GameTicketCategory,
} from "./ticketsApi.js";
import {
  beginTicketResolutionDelivery,
  endTicketResolutionDelivery,
  appendReceiptLink,
  ticketResolutionNonce,
} from "./ticketResolutionDelivery.js";

const CATEGORY_CONFIG: Record<
  TicketCategory,
  { label: string; emoji: string; color: number }
> = {
  bug: { label: "Bug Report", emoji: "🐛", color: 0xed4245 },
  suggestion: { label: "Suggestion", emoji: "💡", color: 0x57f287 },
  moderation: { label: "Moderation Issue", emoji: "🛡️", color: 0xfee75c },
  mechanics: { label: "Mechanics Help", emoji: "🧩", color: 0x5865f2 },
};

/** Map the bot's ticket categories onto the game backend enum (defaults to "other"). */
export function toGameCategory(category: TicketCategory): GameTicketCategory {
  switch (category) {
    case "bug":
      return "bug";
    case "moderation":
      return "moderation";
    case "mechanics":
      return "gameplay";
    default:
      // "suggestion" (and any future categories) have no backend equivalent
      return "other";
  }
}

export const PANEL_EMOJI_MAP: Record<string, TicketCategory> = {
  "🐛": "bug",
  "💡": "suggestion",
  "🛡️": "moderation",
  "🧩": "mechanics",
};

// In-memory lock to prevent race conditions on double-click
const creationLocks = new Set<string>();

function devTeamRoleId(): string | undefined {
  const raw = process.env.DEV_TEAM_ROLE_ID?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

function moderatorRoleId(): string | undefined {
  const raw = process.env.SERVER_MODERATOR_ID?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

/**
 * Who counts as staff for tickets: matches who can access ticket channels (dev/mod role,
 * Manage Channels on this channel or at guild level, ModerateMembers, Administrator).
 * Guild-level `permissions` alone misses channel-only overwrites and the dev/mod roles.
 */
function memberCanActAsTicketStaff(
  member: GuildMember,
  channel: TextChannel,
): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) return true;
  const inChannel =
    channel.permissionsFor(member)?.has(PermissionFlagsBits.ManageChannels) ??
    false;
  if (inChannel) return true;
  const devId = devTeamRoleId();
  if (devId && member.roles.cache.has(devId)) return true;
  const modId = moderatorRoleId();
  if (modId && member.roles.cache.has(modId)) return true;
  return false;
}

function canCloseTicket(
  member: GuildMember,
  channel: TextChannel,
  ticketOpenerId: string,
): boolean {
  if (member.id === ticketOpenerId) return true;
  return memberCanActAsTicketStaff(member, channel);
}

/** Staff closing another member's ticket — resolution required and opener should be DMed. */
function isStaffClosingSomeoneElsesTicket(
  closer: GuildMember,
  channel: TextChannel,
  ticketOpenerId: string,
): boolean {
  return (
    closer.id !== ticketOpenerId && memberCanActAsTicketStaff(closer, channel)
  );
}

export const TICKET_CLAIM_BUTTON_ID = "ticket_claim";

function buildTicketActionRow(
  claimed: boolean,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_CLAIM_BUTTON_ID)
      .setLabel(claimed ? "Claimed" : "Claim Ticket")
      .setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji("🙋")
      .setDisabled(claimed),
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒"),
  );
}

const INTAKE_ID_PREFIX = "ticket_intake";
type IntakeAction = "confirm_page" | "decline_page" | "change_page" | "confirm_platform" | "edit_details";

function buildIntakeActionRow(ticketNumber: number, ticket: NonNullable<ReturnType<typeof getTicketByChannel>>) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${INTAKE_ID_PREFIX}:confirm_all:${ticketNumber}`).setLabel(ticket.intakePageConfirmed && ticket.intakePlatformConfirmed ? "Details confirmed" : "Confirm page and platform").setStyle(ticket.intakePageConfirmed && ticket.intakePlatformConfirmed ? ButtonStyle.Success : ButtonStyle.Primary).setDisabled(Boolean((ticket.intakePageConfirmed && ticket.intakePlatformConfirmed) || ticket.intakeAwaitingReply === "page")),
    new ButtonBuilder().setCustomId(`${INTAKE_ID_PREFIX}:decline_page:${ticketNumber}`).setLabel(ticket.intakeAwaitingReply === "page" ? "Waiting for page details" : "Wrong page / issue").setStyle(ButtonStyle.Secondary).setDisabled(ticket.intakeAwaitingReply === "page"),
    new ButtonBuilder().setCustomId(`${INTAKE_ID_PREFIX}:change_page:${ticketNumber}`).setLabel("Paste link or describe").setStyle(ButtonStyle.Secondary),
  );
}
export const buildTicketIntakeButtons = buildIntakeActionRow;

function buildIntakeModal(action: "change_page" | "edit_details", ticketNumber: number, ticket: NonNullable<ReturnType<typeof getTicketByChannel>>): ModalBuilder {
  const page = true;
  const input = new TextInputBuilder()
    .setCustomId(page ? "intake_page_url" : "intake_environment")
    .setLabel("Page link or menu / issue")
    .setPlaceholder("https://ahousedividedgame.com/... or describe the affected menu")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(500)
    .setRequired(true);
  if (page && ticket.intakeCandidatePageUrl) input.setValue(ticket.intakeCandidatePageUrl.slice(0, 500));
  return new ModalBuilder()
    .setCustomId(`${INTAKE_ID_PREFIX}:modal:${action}:${ticketNumber}`)
    .setTitle("Correct the page or issue")
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
}

function ticketCandidatePage(description?: string): string | undefined {
  const candidate = description?.match(/https?:\/\/[^\s<>]+/i)?.[0]?.replace(/[),.;]+$/, "");
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    const path = parsed.pathname.split(/[?#]/, 1)[0];
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || !/^(?:www\.)?ahousedividedgame\.com$/i.test(parsed.hostname)) return undefined;
    if (!path.startsWith("/") || path.startsWith("//") || /[\\\s<>%]|\.\./.test(path) || path.length > 300 || /^\/(?:api|admin|moderator|auth|login|logout|register|reset-password|settings|account)(?:\/|$)/i.test(path)) return undefined;
    return `https://ahousedividedgame.com${path}`;
  } catch {
    return undefined;
  }
}

export function normalizeTicketPlatformLabel(value?: string | null): string {
  const label = String(value || "").toLowerCase();
  if (/android/.test(label)) return "Android";
  if (/\bios\b|iphone|ipad/.test(label)) return "iOS";
  if (/mobile|phone|tablet/.test(label)) return /browser|web/.test(label) ? "Mobile browser" : "Mobile";
  if (/desktop|windows|macos|linux|computer|laptop/.test(label)) return /client|app/.test(label) ? "Desktop client" : "Desktop browser";
  if (/client/.test(label)) return "Desktop client";
  return "Platform unknown";
}

function intakeEmbed(ticket: NonNullable<ReturnType<typeof getTicketByChannel>>, base?: EmbedBuilder): EmbedBuilder {
  const embed = base ?? new EmbedBuilder().setTitle(`Ticket #${String(ticket.ticketNumber).padStart(4, "0")}`);
  const page = ticket.intakeCandidatePageUrl ?? (!ticket.intakePageDescription && !ticket.intakePageConfirmed && ticket.intakeAwaitingReply !== "page" ? ticketCandidatePage(ticket.description) : undefined);
  const existing = embed.data.fields ?? [];
  const retained = existing.filter((field) => !["Intake", "Affected page / issue", "Affected page", "Page to confirm", "Platform to confirm", "Platform and versions", "Receipt"].includes(field.name));
  embed.setFields([...retained,
    { name: "Intake", value: ticket.intakeAwaitingReply === "page" ? "Which page or menu is affected? Reply here." : ticket.intakePageConfirmed && ticket.intakePlatformConfirmed ? "Details confirmed" : `Page ${ticket.intakePageConfirmed ? "confirmed" : "optional to confirm"} · platform ${ticket.intakePlatformConfirmed ? "confirmed" : "optional to confirm"}`, inline: false },
    { name: "Affected page / issue", value: ticket.intakeAwaitingReply === "page" ? "Which page or menu is affected? Reply here." : ticket.intakePageDescription ? `${ticket.intakePageDescription.slice(0, 900)} · ${ticket.intakePageConfirmed ? "confirmed" : "optional to confirm"}` : page ? `[${page}](${page}) · ${ticket.intakePageConfirmed ? "confirmed" : "optional to confirm"}` : "No page detected · confirm or replace the suggested page", inline: false },
    { name: "Platform and versions", value: [ticket.intakePlatformLabel ?? (ticket.platform ? formatTicketPlatform(ticket.platform) : "Platform unknown"), `Game: ${ticket.intakeGameVersion ?? "version unknown"}`, `Client: ${ticket.intakeClientVersion ?? "version unknown"}`, `Status: ${ticket.intakePlatformConfirmed ? "confirmed" : "please confirm"}`].join("\n"), inline: false },
    { name: "Receipt", value: ticket.intakeReceiptUrl ? `[View ticket receipt](${ticket.intakeReceiptUrl})` : "Receipt link is being prepared", inline: false },
  ]);
  embed.setFooter({ text: "Details are optional. Investigation continues. · ✅ Correct · ❌ Wrong · ahousedividedgame.com" });
  return embed;
}
export const buildTicketIntakeCardEmbed = intakeEmbed;

export function canUpdateTicketIntakeCard(input: {
  reporterId: string;
  actorId: string;
  ticketChannelId: string;
  interactionChannelId: string;
  cardMessageId?: string;
  interactionMessageId?: string;
}): boolean {
  return input.reporterId === input.actorId &&
    input.ticketChannelId === input.interactionChannelId &&
    (!input.cardMessageId || input.cardMessageId === input.interactionMessageId);
}

export function ticketIntakeReactionAction(
  ticket: Pick<NonNullable<ReturnType<typeof getTicketByChannel>>, "intakePageConfirmed" | "intakeAwaitingReply" | "intakeCandidatePageUrl" | "intakePageDescription" | "description">,
  emoji: string,
): "confirm_page" | "decline_page" | null {
  if (emoji === "✅") {
    if (ticket.intakePageConfirmed || ticket.intakeAwaitingReply === "page") return null;
    return ticket.intakeCandidatePageUrl || ticket.intakePageDescription || ticketCandidatePage(ticket.description) ? "confirm_page" : null;
  }
  if (emoji === "❌") return ticket.intakeAwaitingReply === "page" ? null : "decline_page";
  return null;
}

async function persistIntakeInteraction(guildId: string, ticket: NonNullable<ReturnType<typeof getTicketByChannel>>, interactionId: string, action: string, value?: string): Promise<void> {
  if (ticket.intakeInteractionIds?.includes(interactionId)) return;
  ticket.intakeInteractionIds = [...(ticket.intakeInteractionIds ?? []), interactionId].slice(-100);
  addTicket(guildId, ticket);
  const payload = {
    action: "intake",
    ticketNumber: ticket.apiTicketNumber ?? ticket.ticketNumber,
    discordChannelId: ticket.channelId,
    intake: {
      gameVersion: ticketApiVersion(ticket.intakeGameVersion),
      clientVersion: ticketApiVersion(ticket.intakeClientVersion),
    },
    interaction: {
      interactionId,
      reporterDiscordId: ticket.userId,
      action: action as IntakeAction,
      ...((action === "edit_details" ? ticket.intakePlatformLabel : value)
        ? { value: action === "edit_details" ? ticket.intakePlatformLabel : value }
        : {}),
    },
  } as const;
  let saved;
  for (let attempt = 0; attempt < 3; attempt++) {
    saved = await apiUpdateTicket(payload);
    if (saved) break;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (!saved) console.error(`Could not mirror intake interaction ${interactionId} for ticket #${ticket.ticketNumber}`);
  if (saved?.intake) {
    ticket.intakeCardMessageId = saved.intake.cardMessageId ?? ticket.intakeCardMessageId;
    ticket.intakeReceiptUrl = saved.intake.receiptUrl ?? ticket.intakeReceiptUrl;
    ticket.intakeCandidatePageUrl = saved.intake.candidatePageUrl ?? undefined;
    ticket.intakePlatformLabel = saved.intake.platformLabel ?? undefined;
    ticket.intakeGameVersion = saved.intake.gameVersion ?? undefined;
    ticket.intakeClientVersion = saved.intake.clientVersion ?? undefined;
    ticket.intakePageDescription = saved.intake.pageDescription ?? undefined;
    ticket.intakeAwaitingReply = saved.intake.awaitingReply ?? null;
    ticket.intakeRevision = saved.intake.revision ?? ticket.intakeRevision;
    ticket.intakePageConfirmed = saved.intake.pageConfirmed ?? ticket.intakePageConfirmed;
    ticket.intakePlatformConfirmed = saved.intake.platformConfirmed ?? ticket.intakePlatformConfirmed;
    addTicket(guildId, ticket);
  }
}

export async function handleTicketIntakeReaction(reaction: MessageReaction, user: User): Promise<boolean> {
  if (user.bot || !["✅", "❌"].includes(reaction.emoji.name ?? "")) return false;
  const message = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
  const guild = message?.guild;
  if (!message || !guild) return false;
  let ticket = getTicketByChannel(guild.id, message.channelId);
  const hasIntakeControls = message.components.some((row) =>
    "components" in row && row.components.some((component) =>
      "customId" in component && typeof component.customId === "string" && component.customId.startsWith("ticket_intake:"),
    ),
  );
  if (!ticket && hasIntakeControls) {
    await reconcileTicketChannels(guild).catch((error) => console.error("Ticket intake reaction hydration failed:", error));
    ticket = getTicketByChannel(guild.id, message.channelId);
  }
  const action = reaction.emoji.name === "✅" ? "confirm_page" : "decline_page";
  if (!ticket || !canUpdateTicketIntakeCard({ reporterId: ticket.userId, actorId: user.id, ticketChannelId: ticket.channelId, interactionChannelId: message.channelId, cardMessageId: ticket.intakeCardMessageId ?? ticket.embedMessageId, interactionMessageId: message.id })) return false;
  if (ticketIntakeReactionAction(ticket, reaction.emoji.name ?? "") !== action) return true;
  const eventId = `reaction:${ticket.ticketNumber}:${message.id}:${user.id}:${action}:${(ticket.intakeRevision ?? 0) + 1}`;
  if (action === "confirm_page") {
    ticket.intakePageConfirmed = true;
    ticket.intakeAwaitingReply = null;
  } else {
    ticket.intakePageConfirmed = false;
    ticket.intakeAwaitingReply = "page";
  }
  ticket.intakeRevision = (ticket.intakeRevision ?? 0) + 1;
  await persistIntakeInteraction(guild.id, ticket, eventId, action);
  const base = message.embeds[0] ? EmbedBuilder.from(message.embeds[0]) : undefined;
  const components = [
    ...(ticket.embedMessageId === message.id ? [buildTicketActionRow(Boolean(ticket.claimedByUserId))] : []),
    buildIntakeActionRow(ticket.ticketNumber, ticket),
  ];
  await message.edit({ embeds: [intakeEmbed(ticket, base)], components }).catch((error) => console.error(`Failed to edit intake card for #${ticket.ticketNumber}:`, error));
  return true;
}

export async function consumeTicketIntakeReply(message: Message): Promise<boolean> {
  if (!message.guild || message.author.bot || !(message.channel instanceof TextChannel)) return false;
  const ticket = getTicketByChannel(message.guild.id, message.channel.id);
  if (!ticket || ticket.userId !== message.author.id || ticket.intakeAwaitingReply !== "page") return false;
  const value = message.content.trim();
  if (value.length < 2 || value.length > 500) return false;
  if (/^https?:\/\//i.test(value) && !ticketCandidatePage(value)) {
    await message.reply("Please use a page on ahousedividedgame.com, or describe the page or issue in plain text.").catch(() => {});
    return true;
  }
  const candidate = ticketCandidatePage(value);
  ticket.intakeCandidatePageUrl = candidate;
  ticket.intakePageDescription = candidate ? undefined : value;
  ticket.intakePageConfirmed = true;
  ticket.intakeAwaitingReply = null;
  await persistIntakeInteraction(message.guild.id, ticket, message.id, "change_page", candidate ?? value);
  const cardId = ticket.intakeCardMessageId ?? ticket.embedMessageId;
  const card = cardId ? await message.channel.messages.fetch(cardId).catch(() => null) : null;
  if (card) {
    const base = card.embeds[0] ? EmbedBuilder.from(card.embeds[0]) : undefined;
    await card.edit({
      embeds: [intakeEmbed(ticket, base)],
      components: [
        ...(ticket.embedMessageId === card.id ? [buildTicketActionRow(Boolean(ticket.claimedByUserId))] : []),
        buildIntakeActionRow(ticket.ticketNumber, ticket),
      ],
    }).catch((error) => console.error(`Failed to refresh intake card for #${ticket.ticketNumber}:`, error));
    for (const current of card.reactions.cache.filter((item) => ["✅", "❌"].includes(item.emoji.name ?? "")).values()) {
      await current.users.remove(message.author.id).catch(() => {});
    }
    if (!card.reactions.cache.some((item) => item.emoji.name === "✅" && item.me)) await card.react("✅").catch(() => {});
    if (!card.reactions.cache.some((item) => item.emoji.name === "❌" && item.me)) await card.react("❌").catch(() => {});
  }
  return true;
}

function parseTicketNumberFromIntakeId(customId: string): number | undefined {
  const match = /^ticket_intake:(?:[a-z_]+:)?(?:[a-z_]+:)?(\d+)$/.exec(customId);
  const number = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function parseTicketEnvironment(value: string): Pick<NonNullable<ReturnType<typeof getTicketByChannel>>, "intakePlatformLabel" | "intakeGameVersion" | "intakeClientVersion"> {
  const game = /game(?:\s+version)?\s*[:=]?\s*([^,;]+)/i.exec(value)?.[1]?.trim();
  const client = /client(?:\s+version)?\s*[:=]?\s*([^,;]+)/i.exec(value)?.[1]?.trim();
  const platform = value.replace(/game(?:\s+version)?\s*[:=]?\s*[^,;]+/ig, "").replace(/client(?:\s+version)?\s*[:=]?\s*[^,;]+/ig, "").replace(/[,;]+/g, " ").trim();
  const isVersion = (candidate?: string) => Boolean(candidate && /^\d+\.\d+\.\d+(?:[.+-][\w.-]+)?$/.test(candidate));
  const additional = [game && !isVersion(game) ? `game details: ${game}` : "", client && !isVersion(client) ? `client details: ${client}` : ""].filter(Boolean);
  const label = normalizeTicketPlatformLabel(platform || value);
  return {
    intakePlatformLabel: `${label}${additional.length ? `; ${additional.join("; ")}` : ""}`.slice(0, 200),
    intakeGameVersion: isVersion(game) ? game!.slice(0, 40) : "version unknown",
    intakeClientVersion: isVersion(client) ? client!.slice(0, 40) : "version unknown",
  };
}

function ticketApiVersion(value?: string): string | null {
  return value && /^\d+\.\d+\.\d+(?:[.+-][\w.-]+)?$/.test(value) ? value : null;
}
export const normalizeTicketApiVersion = ticketApiVersion;

/** Handle reporter-only intake controls without in-memory collectors. */
export async function handleTicketIntakeComponent(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith("ticket_intake:")) return false;
  if (!interaction.guild || !(interaction.channel instanceof TextChannel)) {
    await interaction.reply({ content: "This intake card is only available inside its ticket channel.", ephemeral: true });
    return true;
  }
  const ticketNumber = parseTicketNumberFromIntakeId(interaction.customId);
  let ticket = ticketNumber ? getTicketByNumber(interaction.guild.id, ticketNumber) : undefined;
  if (!ticket && ticketNumber) {
    await reconcileTicketChannels(interaction.guild).catch((error) => console.error("Ticket intake lazy hydration failed:", error));
    ticket = getTicketByNumber(interaction.guild.id, ticketNumber);
  }
  if (!ticket || ticket.channelId !== interaction.channel.id) {
    await interaction.reply({ content: "I could not match this card to an open ticket. Please ask staff to refresh it.", ephemeral: true });
    return true;
  }
  const expectedCardId = ticket.intakeCardMessageId ?? ticket.embedMessageId;
  if (!canUpdateTicketIntakeCard({ reporterId: ticket.userId, actorId: interaction.user.id, ticketChannelId: ticket.channelId, interactionChannelId: interaction.channel.id, cardMessageId: expectedCardId, interactionMessageId: interaction.message?.id })) {
    await interaction.reply({ content: "Only the person who opened this ticket can update these details.", ephemeral: true });
    return true;
  }

  if (interaction.isButton()) {
    const action = interaction.customId.split(":")[1] as IntakeAction | "confirm_all";
    if (!["confirm_all", "decline_page", "change_page"].includes(action)) return true;
    if (action === "change_page") {
      await interaction.showModal(buildIntakeModal(action, ticketNumber!, ticket));
      return true;
    }
    if (action === "confirm_all" && !(ticket.intakeCandidatePageUrl ?? ticket.intakePageDescription ?? ticketCandidatePage(ticket.description))) {
      await interaction.reply({ content: "No page is listed yet. Paste a link or describe the page first.", ephemeral: true });
      return true;
    }
    if (action === "confirm_all" && ticket.intakeAwaitingReply === "page") {
      await interaction.reply({ content: "Please reply with the corrected page or issue details first.", ephemeral: true });
      return true;
    }
    await interaction.deferReply({ ephemeral: true });
    if (action === "decline_page") {
      ticket.intakePageConfirmed = false;
      ticket.intakeAwaitingReply = "page";
      await persistIntakeInteraction(interaction.guild.id, ticket, interaction.id, "decline_page");
    } else {
      ticket.intakePageConfirmed = true;
      ticket.intakePlatformConfirmed = true;
      ticket.intakeAwaitingReply = null;
      await persistIntakeInteraction(interaction.guild.id, ticket, `${interaction.id}:page`, "confirm_page");
      await persistIntakeInteraction(interaction.guild.id, ticket, `${interaction.id}:platform`, "confirm_platform");
    }
  const cardId = ticket.intakeCardMessageId ?? ticket.embedMessageId;
  const card = cardId ? await interaction.channel.messages.fetch(cardId).catch(() => null) : null;
  if (card) {
    const base = card.embeds[0] ? EmbedBuilder.from(card.embeds[0]) : undefined;
    const rows = [
      ...(ticket.embedMessageId === card.id ? [buildTicketActionRow(Boolean(ticket.claimedByUserId))] : []),
      buildIntakeActionRow(ticketNumber!, ticket),
    ];
    await card.edit({ embeds: [intakeEmbed(ticket, base)], components: rows });
  }
  await interaction.editReply({ content: "Saved. The ticket card has been updated." });
  return true;
}

  const parts = interaction.customId.split(":");
  const action = parts[2] as "change_page";
  if (action !== "change_page") {
    await interaction.reply({ content: "This intake action is no longer available.", ephemeral: true });
    return true;
  }
  const value = interaction.fields.getTextInputValue("intake_page_url").trim();
  if (value.length < 3) {
    await interaction.reply({ content: "Please enter a little more detail.", ephemeral: true });
    return true;
  }
  if (action === "change_page") {
    let parsed: URL | undefined;
    try { parsed = new URL(value); } catch { parsed = undefined; }
    if (parsed && (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || !/(^|\.)ahousedividedgame\.com$/i.test(parsed.hostname))) {
      await interaction.reply({ content: "Use a page on ahousedividedgame.com, or describe the page or issue in plain text.", ephemeral: true });
      return true;
    }
    if (parsed) {
      ticket.intakeCandidatePageUrl = parsed.toString();
      ticket.intakePageDescription = undefined;
    } else {
      if (/^https?:\/\//i.test(value)) {
        await interaction.reply({ content: "That link is not a valid game page URL. You can describe the page or issue in plain text.", ephemeral: true });
        return true;
      }
      ticket.intakeCandidatePageUrl = undefined;
      ticket.intakePageDescription = value.slice(0, 500);
    }
    ticket.intakePageConfirmed = true;
    ticket.intakeAwaitingReply = null;
  }
  await interaction.deferReply({ ephemeral: true });
  await persistIntakeInteraction(interaction.guild.id, ticket, interaction.id, action, value);
  const cardId = ticket.intakeCardMessageId ?? ticket.embedMessageId;
  const card = cardId ? await interaction.channel.messages.fetch(cardId).catch(() => null) : null;
  if (card) {
    const base = card.embeds[0] ? EmbedBuilder.from(card.embeds[0]) : undefined;
    const rows = [
      ...(ticket.embedMessageId === card.id ? [buildTicketActionRow(Boolean(ticket.claimedByUserId))] : []),
      buildIntakeActionRow(ticketNumber!, ticket),
    ];
    await card.edit({ embeds: [intakeEmbed(ticket, base)], components: rows });
  }
  await interaction.editReply({ content: "Saved. The ticket card has been updated." });
  return true;
}

export const TICKET_CLOSE_MODAL_PREFIX = "ticket_close_modal_";

function buildTicketCloseModal(channelId: string): ModalBuilder {
  const resolutionInput = new TextInputBuilder()
    .setCustomId("ticket_resolution_message")
    .setLabel("Resolution message for the opener")
    .setPlaceholder(
      "Required when staff closes someone else's ticket. Shown in the ticket channel and support receipt.",
    )
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(false);

  return new ModalBuilder()
    .setCustomId(`${TICKET_CLOSE_MODAL_PREFIX}${channelId}`)
    .setTitle("Close ticket")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(resolutionInput),
    );
}

/** Best-effort server display name for the opener; falls back to the username. */
function sanitizeDisplayName(
  guild: Guild,
  userId: string,
  username: string,
): string {
  return guild.members.cache.get(userId)?.displayName ?? username;
}

function sanitizeUsername(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 15);
}

async function getOrCreateCategory(guild: Guild): Promise<string> {
  const storedId = getCategoryId(guild.id);
  if (storedId) {
    const existing = guild.channels.cache.get(storedId);
    if (existing) return storedId;
  }

  // Search for existing "Tickets" category
  const found = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === "Tickets",
  );
  if (found) {
    setCategoryId(guild.id, found.id);
    return found.id;
  }

  // Create new category
  const created = await guild.channels.create({
    name: "Tickets",
    type: ChannelType.GuildCategory,
    reason: "AHD Bot — ticket system category",
  });
  setCategoryId(guild.id, created.id);
  return created.id;
}

export interface TicketDetails {
  subject: string;
  description?: string;
  /** Surface the reporter was playing on. Bug reports only; see categoryNeedsPlatform. */
  platform?: TicketPlatform;
}

/**
 * Post a visible alert when a ticket's backend mirror never lands — otherwise
 * it silently never shows up in the support MCP/ops dashboard and nobody knows
 * to go find it in Discord instead.
 */
async function alertSyncFailure(
  guild: Guild,
  channelId: string,
  localTicketNumber: number,
  category: TicketCategory,
  username: string,
): Promise<void> {
  const logChannelId =
    process.env.TICKET_LOG_CHANNEL_ID ?? "1483974417628270593";
  const logChannel = guild.channels.cache.get(logChannelId) as
    TextChannel | undefined;
  const paddedNum = String(localTicketNumber).padStart(4, "0");
  const modRoleId = moderatorRoleId();
  const ping = modRoleId ? `<@&${modRoleId}> ` : "";
  await logChannel
    ?.send(
      `${ping}⚠️ Backend sync failed for ${category} ticket #${paddedNum} (${username}, <#${channelId}>) — ` +
        `it will NOT appear in the support MCP/ops dashboard. Please triage from Discord directly or re-run the sync.`,
    )
    .catch((err) =>
      console.error("Failed to post ticket sync-failure alert:", err),
    );
}

async function alertDeliveryFailure(
  guild: Guild,
  channelId: string,
  ticketNumber: number,
  username: string,
  failedMessages: string[],
): Promise<void> {
  const logChannelId =
    process.env.TICKET_LOG_CHANNEL_ID ?? "1483974417628270593";
  const logChannel = guild.channels.cache.get(logChannelId) as
    TextChannel | undefined;
  const modRoleId = moderatorRoleId();
  const ping = modRoleId ? `<@&${modRoleId}> ` : "";
  await logChannel
    ?.send(
      `${ping}⚠️ Ticket #${String(ticketNumber).padStart(4, "0")} was created, but Discord could not deliver ${failedMessages.join(" and ")} to its channel (<#${channelId}>, ${username}). Please inspect the channel and deliver the missing message manually.`,
    )
    .catch((err) =>
      console.error("Failed to post ticket delivery-failure alert:", err),
    );
}

/**
 * Compact filing-time questions for the persistent intake card. Pure so the
 * prompt can be tested and is never emitted as a separate channel message.
 */
export function buildFilingQuestionsMessage(
  contextQuestions?: string[],
): string | null {
  const questions = (contextQuestions ?? [])
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!questions.length) return null;
  return [
    "Please confirm these details so we can investigate:",
    "",
    ...questions.map((q) => `- ${q}`),
    "",
    "Reply here with the missing link or details and we will continue.",
  ]
    .join("\n")
    .slice(0, 1900);
}

export function ticketNumberFromChannelName(name: string): number | null {
  const match = /^(?:closed-)?ticket-[a-z0-9-]+-(\d+)$/i.exec(name);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/** Rehydrate locally-created ticket records for channels opened by staff tools. */
export async function reconcileTicketChannels(guild: Guild): Promise<void> {
  const channels = await guild.channels.fetch();
  let highest = getTicketNumberFloor(guild.id);
  for (const channel of channels.values()) {
    if (!channel || channel.type !== ChannelType.GuildText) continue;
    const nameMatch = /^ticket-[a-z0-9-]+-(\d+)$/i.exec(channel.name);
    if (!nameMatch) continue;
    const ticketNumber = Number(nameMatch[1]);
    if (!Number.isSafeInteger(ticketNumber) || ticketNumber < 1) continue;
    highest = Math.max(highest, ticketNumber);

    const previous = getTicketByChannel(guild.id, channel.id);
    if (
      previous?.ticketNumber === ticketNumber &&
      previous.apiTicketNumber === ticketNumber &&
      previous.intakeCardMessageId
    )
      continue;
    try {
      const messages = await channel.messages.fetch({ limit: 100 });
      const embeds = [...messages.values()]
        .filter((message) => message.embeds.length > 0)
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)[0];
      const allEmbeds = [...messages.values()].filter((message) => message.embeds.length > 0).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
      const opening = embeds;
      const card = [...allEmbeds].reverse().find((message) =>
        message.embeds[0].fields.some((item) => ["intake", "affected page", "affected page / issue", "page to confirm", "platform to confirm", "platform and versions"].includes(item.name.toLowerCase()))
      ) ?? opening;
      const embed = opening?.embeds[0];
      const fields = embed?.fields ?? [];
      const field = (name: string) =>
        fields.find((item) => item.name.toLowerCase() === name.toLowerCase())
          ?.value;
      const reporter = field("Reporter");
      const openedBy = field("Opened by") ?? "";
      const openedByIds = [...openedBy.matchAll(/\d{15,22}/g)].map((match) => match[0]);
      const reporterId = reporter?.match(/\d{15,22}/)?.[0] ?? (openedBy.toLowerCase().includes("on behalf") ? openedByIds.at(-1) : openedByIds[0]);
      const claimedById = field("Claimed by")?.match(/\d{15,22}/)?.[0];
      const reporterPermission = channel.permissionOverwrites.cache.find(
        (overwrite) =>
          overwrite.type === 1 && overwrite.id !== guild.client.user?.id,
      );
      const categoryText =
        field("Category")?.toLowerCase() ?? embed?.title?.toLowerCase() ?? "";
      const category: TicketCategory = categoryText.includes("moderation")
        ? "moderation"
        : categoryText.includes("suggest")
          ? "suggestion"
          : categoryText.includes("bug")
            ? "bug"
            : "mechanics";
      const platformText = field("Platform")?.toLowerCase();
      const platform = TICKET_PLATFORMS.find(
        (option) =>
          option.label.toLowerCase() === platformText ||
          option.value === platformText,
      )?.value as TicketPlatform | undefined;
      const subject = field("Subject") ?? previous?.subject;
      const description = embed?.description ?? previous?.description;
      const cardFields = card?.embeds[0].fields ?? [];
      const cardField = (name: string) => cardFields.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value;
      const pageField = cardField("Affected page / issue") ?? cardField("Affected page") ?? cardField("Page to confirm");
      const candidateMatch = pageField?.match(/https?:\/\/[^\s)]+/i)?.[0];
      const receiptMatch = cardField("Receipt")?.match(/https?:\/\/[^\s)]+/i)?.[0];
      const envLines = (cardField("Platform and versions") ?? cardField("Platform to confirm"))?.split("\n") ?? [];
      const intakeStatus = cardField("Intake")?.toLowerCase() ?? "";

      addTicket(guild.id, {
        ...previous,
        userId:
          reporterId ?? previous?.userId ?? reporterPermission?.id ?? "unknown",
        category: previous?.category ?? category,
        channelId: channel.id,
        createdAt:
          previous?.createdAt ??
          opening?.createdAt.toISOString() ??
          new Date().toISOString(),
        ticketNumber,
        ...(subject ? { subject } : {}),
        ...(description ? { description } : {}),
        ...((platform ?? previous?.platform)
          ? { platform: platform ?? previous?.platform }
          : {}),
        ...(claimedById && !previous?.claimedByUserId
          ? { claimedByUserId: claimedById }
          : {}),
        ...(opening ? { embedMessageId: opening.id } : {}),
        ...(card ? { intakeCardMessageId: card.id } : {}),
        ...(candidateMatch ? { intakeCandidatePageUrl: candidateMatch } : {}),
        ...(pageField && !candidateMatch ? { intakePageDescription: pageField.replace(/\s*·\s*(?:confirmed|please confirm)\s*$/i, "") } : {}),
        ...(intakeStatus.includes("waiting for your corrected") ? { intakeAwaitingReply: "page" as const } : {}),
        ...(receiptMatch ? { intakeReceiptUrl: receiptMatch } : {}),
        ...(envLines[0] ? { intakePlatformLabel: normalizeTicketPlatformLabel(envLines[0]) } : {}),
        ...(envLines[1] ? { intakeGameVersion: envLines[1].replace(/^Game:\s*/i, "") } : {}),
        ...(envLines[2] ? { intakeClientVersion: envLines[2].replace(/^Client:\s*/i, "") } : {}),
        ...(intakeStatus.includes("page confirmed") || intakeStatus === "details confirmed" ? { intakePageConfirmed: true } : {}),
        ...(envLines[3]?.toLowerCase().includes("confirmed") && !envLines[3]?.toLowerCase().includes("please") || intakeStatus.includes("platform confirmed") || intakeStatus === "details confirmed" ? { intakePlatformConfirmed: true } : {}),
        apiTicketNumber: ticketNumber,
      });
      if (card) {
        const stored = getTicketByChannel(guild.id, channel.id);
        if (stored) {
          const context = await getTicketIntakeContext(ticketNumber, channel.id);
          const serverIntake = context?.intake;
          const suggestion = context?.intakeSuggestion;
          if (context?.discordUserId) stored.userId = context.discordUserId;
          stored.intakeCardMessageId = serverIntake?.cardMessageId ?? card.id;
          stored.intakeReceiptUrl = serverIntake?.receiptUrl ?? stored.intakeReceiptUrl;
          stored.intakeCandidatePageUrl = serverIntake ? serverIntake.candidatePageUrl ?? undefined : stored.intakeCandidatePageUrl ?? suggestion?.candidatePageUrl ?? undefined;
          stored.intakePageDescription = serverIntake ? serverIntake.pageDescription ?? undefined : stored.intakePageDescription;
          stored.intakePlatformLabel = serverIntake?.platformLabel ?? stored.intakePlatformLabel ?? (suggestion?.platformLabel ? normalizeTicketPlatformLabel(suggestion.platformLabel) : undefined);
          stored.intakeGameVersion = serverIntake?.gameVersion ?? stored.intakeGameVersion ?? suggestion?.gameVersion ?? undefined;
          stored.intakeClientVersion = serverIntake?.clientVersion ?? stored.intakeClientVersion ?? suggestion?.clientVersion ?? undefined;
          stored.intakePageConfirmed = serverIntake?.pageConfirmed ?? stored.intakePageConfirmed;
          stored.intakePlatformConfirmed = serverIntake?.platformConfirmed ?? stored.intakePlatformConfirmed;
          stored.intakeAwaitingReply = serverIntake ? serverIntake.awaitingReply ?? null : stored.intakeAwaitingReply;
          stored.intakeRevision = serverIntake?.revision ?? stored.intakeRevision;
          stored.intakeReceiptUrl = stored.intakeReceiptUrl ?? await getTicketReceiptUrl(ticketNumber);
          addTicket(guild.id, stored);
          const seeded = await apiUpdateTicket({
            action: "intake", ticketNumber, discordChannelId: channel.id,
            intake: {
              cardMessageId: card.id,
              receiptUrl: stored.intakeReceiptUrl ?? null,
              candidatePageUrl: stored.intakeCandidatePageUrl ?? null,
              pageDescription: stored.intakePageDescription ?? null,
              platformLabel: stored.intakePlatformLabel ?? null,
              gameVersion: stored.intakeGameVersion ?? null,
              clientVersion: stored.intakeClientVersion ?? null,
            },
          });
          if (seeded?.intake) {
            stored.intakePageConfirmed = seeded.intake.pageConfirmed ?? stored.intakePageConfirmed;
            stored.intakePlatformConfirmed = seeded.intake.platformConfirmed ?? stored.intakePlatformConfirmed;
            stored.intakeAwaitingReply = seeded.intake.awaitingReply ?? stored.intakeAwaitingReply;
            stored.intakeRevision = seeded.intake.revision ?? stored.intakeRevision;
            addTicket(guild.id, stored);
          }
          await card.edit({
            embeds: [intakeEmbed(stored, EmbedBuilder.from(card.embeds[0]))],
            components: [
              ...(stored.embedMessageId === card.id ? [buildTicketActionRow(Boolean(stored.claimedByUserId))] : []),
              buildIntakeActionRow(stored.ticketNumber, stored),
            ],
          }).catch((error) => console.error(`Could not restore intake card for ticket #${ticketNumber}:`, error));
          if (!card.reactions.cache.some((item) => item.emoji.name === "✅")) await card.react("✅").catch(() => {});
          if (!card.reactions.cache.some((item) => item.emoji.name === "❌")) await card.react("❌").catch(() => {});
        }
      }
    } catch (error) {
      console.error(`Could not rehydrate ticket channel ${channel.id}:`, error);
      if (!previous) {
        addTicket(guild.id, {
          userId: "unknown",
          category: "mechanics",
          channelId: channel.id,
          createdAt: new Date().toISOString(),
          ticketNumber,
          apiTicketNumber: ticketNumber,
        });
      } else if (previous.ticketNumber !== ticketNumber) {
        addTicket(guild.id, {
          ...previous,
          ticketNumber,
          apiTicketNumber: ticketNumber,
        });
      }
    }
  }
  setTicketNumberFloor(guild.id, highest);
}

export async function createTicket(
  guild: Guild,
  userId: string,
  username: string,
  category: TicketCategory,
  details?: TicketDetails,
): Promise<
  | { success: true; channelId: string }
  | { success: false; reason: string; existingChannelId?: string }
> {
  const lockKey = `${guild.id}:${userId}:${category}`;
  if (creationLocks.has(lockKey)) {
    return {
      success: false,
      reason: "Your ticket is already being created. Please wait.",
    };
  }

  creationLocks.add(lockKey);
  try {
    // Check bot permissions
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return {
        success: false,
        reason: "I need the **Manage Channels** permission to create tickets.",
      };
    }

    // Per-category limit (with stale cleanup)
    // Clean up stale tickets (channels that no longer exist)
    let activeCount = 0;
    let firstActiveChannelId: string | undefined;
    const allCategoryTickets = Object.values(getTickets(guild.id)).filter(
      (t) => t.userId === userId && t.category === category,
    );
    for (const t of allCategoryTickets) {
      if (guild.channels.cache.has(t.channelId)) {
        activeCount++;
        if (!firstActiveChannelId) firstActiveChannelId = t.channelId;
      } else {
        // Stale — clean up
        removeTicket(guild.id, t.channelId);
      }
    }

    if (activeCount >= MAX_TICKETS_PER_CATEGORY) {
      return {
        success: false,
        reason: `You already have ${activeCount} open ${category} ticket(s). You can have up to ${MAX_TICKETS_PER_CATEGORY} per category. Close one first: <#${firstActiveChannelId}>`,
        existingChannelId: firstActiveChannelId,
      };
    }

    const channels = await guild.channels.fetch();
    const discordFloor = [...channels.values()].reduce((floor, channel) => {
      if (!channel || channel.type !== ChannelType.GuildText) return floor;
      const number = ticketNumberFromChannelName(channel.name);
      return number ? Math.max(floor, number) : floor;
    }, getTicketNumberFloor(guild.id));
    // The shared game counter is authoritative for every ticket creator. Fail
    // closed here so a backend outage can never create a duplicate channel.
    const ticketNumber = await apiReserveTicketNumber(discordFloor);
    setTicketNumberFloor(guild.id, ticketNumber);
    const categoryId = await getOrCreateCategory(guild);
    const paddedNum = String(ticketNumber).padStart(4, "0");
    const channelName = `ticket-${category}-${sanitizeUsername(username)}-${paddedNum}`;

    const devTeamRoleId = process.env.DEV_TEAM_ROLE_ID ?? "1470571508689535188";
    const modRoleId = moderatorRoleId();
    const ticketViewerRoleId = "1483975767703552111";

    const permissionOverwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: userId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: guild.members.me!.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
        ],
      },
      ...(devTeamRoleId
        ? [
            {
              id: devTeamRoleId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ]
        : []),
      ...(modRoleId
        ? [
            {
              id: modRoleId,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ]
        : []),
      {
        id: ticketViewerRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites,
      reason: `AHD Bot — ticket #${paddedNum} (${category})`,
    });

    const config = CATEGORY_CONFIG[category];

    const embed = new EmbedBuilder()
      .setTitle(`${config.emoji} ${config.label} — #${paddedNum}`)
      .setColor(config.color)
      .addFields(
        { name: "Opened by", value: `<@${userId}>`, inline: true },
        { name: "Category", value: config.label, inline: true },
        {
          name: "Created",
          value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true,
        },
      );

    if (details?.platform) {
      embed.addFields({
        name: "Platform",
        value: formatTicketPlatform(details.platform),
        inline: true,
      });
    }
    if (details?.subject) {
      embed.addFields({ name: "Subject", value: details.subject });
    }
    if (details?.description) {
      embed.setDescription(details.description.slice(0, 4096));
    }

    embed.setFooter({ text: "ahousedividedgame.com" }).setTimestamp();

    const candidatePageUrl = ticketCandidatePage(details?.description);
    const provisionalTicket = {
      userId, category, channelId: channel.id, createdAt: new Date().toISOString(), ticketNumber,
      subject: details?.subject, description: details?.description, platform: details?.platform,
      intakeCandidatePageUrl: candidatePageUrl,
      intakePlatformLabel: details?.platform ? normalizeTicketPlatformLabel(formatTicketPlatform(details.platform)) : undefined,
      intakeGameVersion: "version unknown", intakeClientVersion: "version unknown",
    };
    const embedMessage = await channel.send({
      embeds: [intakeEmbed(provisionalTicket, embed)],
      components: [buildTicketActionRow(false)],
    });

    const ticketRecord: Ticket = {
      userId,
      category,
      channelId: channel.id,
      createdAt: new Date().toISOString(),
      ticketNumber,
      subject: details?.subject,
      description: details?.description,
      platform: details?.platform,
      embedMessageId: embedMessage.id,
      intakeCardMessageId: embedMessage.id,
      intakeReceiptUrl: undefined,
      intakeCandidatePageUrl: candidatePageUrl,
      intakePlatformLabel: details?.platform ? normalizeTicketPlatformLabel(formatTicketPlatform(details.platform)) : undefined,
      intakeGameVersion: "version unknown",
      intakeClientVersion: "version unknown",
    };
    addTicket(guild.id, ticketRecord);
    await embedMessage.edit({
      embeds: [intakeEmbed(ticketRecord, EmbedBuilder.from(embedMessage.embeds[0]))],
      components: [buildTicketActionRow(false), buildIntakeActionRow(ticketNumber, ticketRecord)],
    }).catch((error) => console.error(`Could not activate intake card for #${paddedNum}:`, error));
    await embedMessage.react("✅").catch(() => {});
    await embedMessage.react("❌").catch(() => {});

    // Moderation pings mods, bug reports ping the dev team. Mechanics-help
    // tickets ping nobody — staff still have channel access via the overwrites
    // above, so they can answer, but the opener just gets a space to ask.
    const pingRoleId =
      category === "moderation"
        ? modRoleId
        : category === "bug"
          ? devTeamRoleId
          : undefined;
    if (pingRoleId) {
      await channel.send(`<@&${pingRoleId}>`).catch(() => {});
    }

    // Paths that never showed the picker (reaction panels, the text-only
    // fallback modal) still have to ask, or the ticket arrives unreproducible.
    // Platform and page confirmation live on the persistent intake card above.

    // Mirror into the game backend using the shared atomic number reservation.
    const openerName = sanitizeDisplayName(guild, userId, username);
    const title = (details?.subject?.trim() || `${config.label}`).slice(0, 200);
    const body =
      details?.description?.trim() ||
      details?.subject?.trim() ||
      "No description provided.";
    // The backend ticket schema has no platform field, so the answer rides in the
    // description, which is what the ops dashboard, support MCP and triage read.
    const description = (
      details?.platform
        ? `Platform: ${formatTicketPlatform(details.platform)}\n\n${body}`
        : body
    ).slice(0, 5000);
    apiCreateTicket({
      category: toGameCategory(category),
      title,
      description,
      discordChannelId: channel.id,
      discordUserId: userId,
      discordUsername: username,
      discordDisplayName: openerName,
      // The shared reservation is authoritative; send its number so the backend
      // stores the same value shown in Discord.
      ticketNumber,
    })
      .then(async (res) => {
        if (res?.ticketNumber != null) {
          addTicket(guild.id, {
            ...ticketRecord,
            apiTicketNumber: res.ticketNumber,
          });

          let receiptUrl: string | undefined;
          for (const delayMs of [0, 1000, 3000]) {
            if (delayMs)
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            receiptUrl = await getTicketReceiptUrl(res.ticketNumber);
            if (receiptUrl) break;
          }
          const failedMessages: string[] = [];
          if (receiptUrl) {
            ticketRecord.intakeReceiptUrl = receiptUrl;
            const intakeContext = await getTicketIntakeContext(res.ticketNumber, channel.id);
            const suggestion = intakeContext?.intakeSuggestion;
            ticketRecord.intakeCandidatePageUrl = ticketRecord.intakeCandidatePageUrl ?? suggestion?.candidatePageUrl ?? undefined;
            ticketRecord.intakePlatformLabel = ticketRecord.intakePlatformLabel ?? (suggestion?.platformLabel ? normalizeTicketPlatformLabel(suggestion.platformLabel) : undefined);
            ticketRecord.intakeGameVersion = suggestion?.gameVersion ?? ticketRecord.intakeGameVersion;
            ticketRecord.intakeClientVersion = suggestion?.clientVersion ?? ticketRecord.intakeClientVersion;
            const intakeSeed = await apiUpdateTicket({
              action: "intake",
              ticketNumber: res.ticketNumber,
              discordChannelId: channel.id,
              intake: {
                cardMessageId: embedMessage.id,
                receiptUrl,
                candidatePageUrl: ticketRecord.intakeCandidatePageUrl ?? null,
                platformLabel: ticketRecord.intakePlatformLabel ?? null,
                gameVersion: ticketRecord.intakeGameVersion === "version unknown" ? suggestion?.gameVersion ?? null : ticketRecord.intakeGameVersion ?? null,
                clientVersion: ticketRecord.intakeClientVersion === "version unknown" ? suggestion?.clientVersion ?? null : ticketRecord.intakeClientVersion ?? null,
              },
            });
            if (!intakeSeed) console.error(`Could not seed intake state for ticket #${res.ticketNumber}`);
            if (intakeSeed?.intake) {
              ticketRecord.intakePageConfirmed = intakeSeed.intake.pageConfirmed ?? false;
              ticketRecord.intakePlatformConfirmed = intakeSeed.intake.platformConfirmed ?? false;
            }
            const currentCard = await channel.messages.fetch(embedMessage.id).catch(() => null);
            if (currentCard) {
              const base = currentCard.embeds[0] ? EmbedBuilder.from(currentCard.embeds[0]) : undefined;
              const cardEmbed = intakeEmbed(ticketRecord, base);
              const missingDetails = buildFilingQuestionsMessage(res.contextQuestions);
              if (missingDetails) cardEmbed.addFields({ name: "Details needed", value: missingDetails.slice(0, 1000), inline: false });
              await currentCard.edit({
                embeds: [cardEmbed],
                components: [buildTicketActionRow(false), buildIntakeActionRow(ticketNumber, ticketRecord)],
              }).catch(() => failedMessages.push("the receipt link on the intake card"));
            } else {
              failedMessages.push("the receipt link on the intake card");
            }
            addTicket(guild.id, ticketRecord);
          } else {
            console.error(
              `Receipt link unavailable for newly created ticket #${res.ticketNumber}`,
            );
            failedMessages.push("the receipt link (receipt URL unavailable)");
          }

          // The backend persists the number we sent, so res.ticketNumber should
          // equal `ticketNumber` and the channel/embed already show it — no rename.
          // A mismatch means the backend already had that number for a different
          // channel (a genuine collision): surface it rather than silently renaming
          // the channel to match, which would defeat Discord being the source of truth.
          if (res.ticketNumber !== ticketNumber) {
            console.error(
              `Ticket #${paddedNum} sync mismatch: backend returned #${res.ticketNumber} for channel ${channel.id}`,
            );
            await alertSyncFailure(
              guild,
              channel.id,
              ticketNumber,
              category,
              username,
            );
          }

          if (failedMessages.length) {
            await alertDeliveryFailure(
              guild,
              channel.id,
              res.ticketNumber,
              username,
              failedMessages,
            );
          }
        } else {
          // apiCreateTicket already retried internally; a final undefined here means
          // this ticket never made it into the backend and won't show up in the
          // support MCP/ops dashboard at all unless someone notices and re-syncs it.
          await alertSyncFailure(
            guild,
            channel.id,
            ticketNumber,
            category,
            username,
          );
        }
      })
      .catch(async (err) => {
        console.error("Unexpected error mirroring ticket to backend:", err);
        await alertSyncFailure(
          guild,
          channel.id,
          ticketNumber,
          category,
          username,
        );
      });

    return { success: true, channelId: channel.id };
  } finally {
    creationLocks.delete(lockKey);
  }
}

export async function fetchAllMessages(
  channel: TextChannel,
  cap: number,
): Promise<Message[]> {
  const all: Message[] = [];
  let lastId: string | undefined;

  while (all.length < cap) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(lastId ? { before: lastId } : {}),
    });
    if (batch.size === 0) break;
    all.push(...batch.values());
    lastId = batch.last()!.id;
    if (batch.size < 100) break;
  }

  return all.slice(0, cap).reverse(); // chronological order
}

function buildTranscriptText(
  ticket: {
    ticketNumber: number;
    category: TicketCategory;
    userId: string;
    createdAt: string;
    subject?: string;
    description?: string;
  },
  closerId: string,
  messages: Message[],
  resolutionMessage?: string,
  receiptUrl?: string,
): string {
  const config = CATEGORY_CONFIG[ticket.category];
  const lines: string[] = [
    `Ticket #${String(ticket.ticketNumber).padStart(4, "0")} — ${config.label}`,
    `Opened by: ${ticket.userId}`,
    `Closed by: ${closerId}`,
    `Created: ${ticket.createdAt}`,
    `Closed: ${new Date().toISOString()}`,
  ];
  if (ticket.subject) lines.push(`Subject: ${ticket.subject}`);
  if (ticket.description) lines.push(`Description: ${ticket.description}`);
  lines.push(`Messages: ${messages.length}`);
  if (resolutionMessage) {
    lines.push(`Resolution (to opener): ${resolutionMessage}`);
  }
  if (receiptUrl) lines.push(`Receipt: ${receiptUrl}`);
  lines.push("---");

  for (const msg of messages) {
    const ts = msg.createdAt.toISOString().slice(0, 19).replace("T", " ");
    const author = `${msg.author.displayName} (${msg.author.id})`;
    const content = msg.content || "[embed/attachment]";
    lines.push(`[${ts}] ${author}: ${content}`);
  }

  return lines.join("\n");
}

/** Remove a closed ticket channel after its outcome and transcript are saved. */
export async function closeTicketChannel(
  channel: TextChannel,
  ticketNumber: number,
): Promise<void> {
  await channel.delete(`Ticket #${ticketNumber} closed`);
}

/** Archive and remove channels left behind by the old rename-only close flow. */
export async function closeLegacyNamedTicketChannel(
  channel: TextChannel,
): Promise<boolean> {
  const match = /^closed-ticket-[a-z0-9-]+-(\d+)$/i.exec(channel.name);
  if (!match) return false;

  const ticketNumber = Number(match[1]);
  const messages = await fetchAllMessages(channel, 500);
  const transcript = [
    `Legacy closed ticket #${ticketNumber}`,
    `Channel: ${channel.name} (${channel.id})`,
    `Messages: ${messages.length}`,
    "---",
    ...messages.map((message) =>
      [
        `[${message.createdAt.toISOString()}] ${message.author.displayName} (${message.author.id}): ${message.content || "[embed/attachment]"}`,
        ...message.attachments.map((attachment) => attachment.url),
        ...message.embeds.map((embed) => embed.description).filter(Boolean),
      ].join("\n"),
    ),
  ].join("\n");
  const logChannelId =
    process.env.TICKET_LOG_CHANNEL_ID ?? "1483974417628270593";
  const logChannel = await channel.guild.channels.fetch(logChannelId);
  if (logChannel?.type !== ChannelType.GuildText) {
    throw new Error(`Ticket log channel ${logChannelId} is unavailable`);
  }
  await logChannel.send({
    content: `Archived legacy closed ticket #${ticketNumber} before removing its channel.`,
    files: [
      {
        attachment: Buffer.from(transcript, "utf-8"),
        name: `ticket-${ticketNumber}-legacy.txt`,
      },
    ],
  });
  await closeTicketChannel(channel, ticketNumber);
  if (getTicketByChannel(channel.guild.id, channel.id)) {
    removeTicket(channel.guild.id, channel.id);
  }
  return true;
}

interface TicketCloseResult {
  ticketUpdated: boolean;
  receiptLinkAvailable: boolean;
  channelReceiptDelivered: boolean;
  channelClosed: boolean;
  dmDelivered: boolean;
  alreadyInProgress?: boolean;
}

/** Avoid racing the periodic resolution sweep against a staff close click. */
async function finalizeTicketClose(
  channel: TextChannel,
  closer: GuildMember,
  ticket: NonNullable<ReturnType<typeof getTicketByChannel>>,
  resolutionMessage: string,
): Promise<TicketCloseResult> {
  const ticketNumber = ticket.apiTicketNumber ?? ticket.ticketNumber;
  if (!beginTicketResolutionDelivery(ticketNumber)) {
    return {
      ticketUpdated: false,
      receiptLinkAvailable: false,
      channelReceiptDelivered: false,
      channelClosed: false,
      dmDelivered: false,
      alreadyInProgress: true,
    };
  }

  try {
    return await finalizeTicketCloseImpl(
      channel,
      closer,
      ticket,
      resolutionMessage,
    );
  } finally {
    endTicketResolutionDelivery(ticketNumber);
  }
}

async function finalizeTicketCloseImpl(
  channel: TextChannel,
  closer: GuildMember,
  ticket: NonNullable<ReturnType<typeof getTicketByChannel>>,
  resolutionMessage: string,
): Promise<TicketCloseResult> {
  const guild = channel.guild;
  const messages = await fetchAllMessages(channel, 500);
  const truncated = messages.length >= 500;

  const config = CATEGORY_CONFIG[ticket.category];
  const paddedNum = String(ticket.ticketNumber).padStart(4, "0");
  const apiTicketNumber = ticket.apiTicketNumber ?? ticket.ticketNumber;
  const created = new Date(ticket.createdAt);
  const duration = Math.floor((Date.now() - created.getTime()) / 60000);
  const durationStr =
    duration < 60
      ? `${duration}m`
      : `${Math.floor(duration / 60)}h ${duration % 60}m`;

  // Build log embed with original ticket details
  const logFields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Type", value: `${config.emoji} ${config.label}`, inline: true },
    { name: "Opened by", value: `<@${ticket.userId}>`, inline: true },
    { name: "Closed by", value: `<@${closer.id}>`, inline: true },
    { name: "Duration", value: durationStr, inline: true },
    { name: "Messages", value: String(messages.length), inline: true },
  ];

  if (ticket.subject) {
    logFields.push({
      name: "Subject",
      value:
        ticket.subject.length > 1024
          ? `${ticket.subject.slice(0, 1021)}...`
          : ticket.subject,
    });
  }
  if (ticket.description) {
    const descValue =
      ticket.description.length > 1024
        ? `${ticket.description.slice(0, 1021)}...`
        : ticket.description;
    logFields.push({ name: "Description", value: descValue });
  }
  if (resolutionMessage) {
    logFields.push({
      name: "Resolution",
      value:
        resolutionMessage.length > 1024
          ? `${resolutionMessage.slice(0, 1021)}...`
          : resolutionMessage,
    });
  }
  const receiptUrl = await getTicketReceiptUrl(apiTicketNumber);
  if (receiptUrl) {
    logFields.push({
      name: "Receipt",
      value: `[View player receipt](${receiptUrl})`,
    });
  }

  const logEmbed = new EmbedBuilder()
    .setTitle(`🎫 Ticket Closed — #${paddedNum}`)
    .setColor(0x95a5a6)
    .addFields(logFields)
    .setFooter({
      text: truncated
        ? "Transcript truncated at 500 messages · ahousedividedgame.com"
        : "ahousedividedgame.com",
    })
    .setTimestamp();

  let transcript = buildTranscriptText(
    ticket,
    closer.id,
    messages,
    resolutionMessage || undefined,
    receiptUrl,
  );

  let playerResolution =
    resolutionMessage || "The ticket was closed by the reporter.";
  const playerFollowUp =
    "If the issue is still present, open a new support ticket and mention this report.";
  const resolutionText = [
    `<@${ticket.userId}>`,
    "",
    "**Your support report has been resolved.**",
    "",
    playerResolution,
    "",
    playerFollowUp,
  ]
    .filter(Boolean)
    .join("\n");
  const receiptMessage = receiptUrl
    ? appendReceiptLink(resolutionText, receiptUrl, 1900)
    : resolutionText.slice(0, 1900);

  // Mirror the final outcome when a backend record exists. Discord tickets
  // that failed their initial sync must still be closable from the local store.
  const persisted = await apiUpdateTicket({
    discordChannelId: channel.id,
    action: "close",
    closedBy: closer.id,
    resolution: playerResolution,
  });
  if (!persisted) {
    console.warn(
      `Ticket #${paddedNum} close: backend resolution persist did not confirm — ` +
        `closing the Discord channel and retaining the staff transcript.`,
    );
    logEmbed.addFields({
      name: "Backend sync",
      value: "Unavailable; reconcile from this transcript",
    });
    transcript +=
      "\nBackend sync: unavailable at close; reconcile this ticket from the transcript.";
  }
  playerResolution = persisted?.finalOutcome || playerResolution;

  let channelReceiptDelivered = Boolean(persisted?.channelUpdatePosted);
  let channelReceiptMessageId: string | undefined;
  if (!channelReceiptDelivered) {
    try {
      const channelReceipt = await channel.send({
        content: receiptMessage,
        allowedMentions: { users: [ticket.userId] },
        nonce: ticketResolutionNonce(
          "tr",
          apiTicketNumber,
          persisted?.resolutionVersion,
        ),
        enforceNonce: true,
      });
      channelReceiptMessageId = channelReceipt.id;
      channelReceiptDelivered = true;
    } catch (err) {
      console.warn("Ticket channel receipt post failed:", err);
    }
  }

  if (persisted && !persisted.channelUpdatePosted) {
    if (channelReceiptDelivered) {
      const channelReceiptRecorded = await apiUpdateTicket({
        discordChannelId: channel.id,
        action: "resolution-channel-delivered",
        ...(channelReceiptMessageId
          ? { messageId: channelReceiptMessageId }
          : {}),
      });
      if (!channelReceiptRecorded) {
        console.warn(
          `Ticket #${paddedNum} channel receipt marker did not persist; the resolution sweep may retry it.`,
        );
      }
    }
  }

  const logChannelId =
    process.env.TICKET_LOG_CHANNEL_ID ?? "1483974417628270593";
  if (logChannelId) {
    const logChannel = guild.channels.cache.get(logChannelId) as
      TextChannel | undefined;
    if (logChannel) {
      const buffer = Buffer.from(transcript, "utf-8");
      await logChannel
        .send({
          embeds: [logEmbed],
          files: [{ attachment: buffer, name: `ticket-${paddedNum}.txt` }],
        })
        .catch((err) => console.error("Failed to post transcript:", err));
    }
  }

  let channelClosed = false;
  try {
    await closeTicketChannel(channel, ticket.ticketNumber);
    channelClosed = true;
  } catch (err) {
    console.warn(
      `Ticket #${paddedNum} outcome was saved, but the channel could not be closed:`,
      err,
    );
    return {
      ticketUpdated: Boolean(persisted),
      receiptLinkAvailable: Boolean(receiptUrl),
      channelReceiptDelivered,
      channelClosed: false,
      dmDelivered: false,
    };
  }

  let dmDelivered = Boolean(persisted?.resolutionDelivered);
  try {
    if (!dmDelivered) {
      const opener = await closer.client.users.fetch(ticket.userId);
      const header = `Your **${config.label}** ticket has been closed by ${closer.user.tag}.`;
      const dmText = [
        header,
        "",
        "**Final outcome**",
        playerResolution,
        "",
        playerFollowUp,
      ]
        .filter(Boolean)
        .join("\n");
      const dmDescription = receiptUrl
        ? appendReceiptLink(dmText, receiptUrl, 4096)
        : dmText.slice(0, 4096);
      const dmEmbed = new EmbedBuilder()
        .setTitle(`Ticket #${paddedNum} closed`)
        .setColor(0x95a5a6)
        .setDescription(dmDescription)
        .setFooter({ text: "ahousedividedgame.com" })
        .setTimestamp();
      if (ticket.subject) {
        dmEmbed.addFields({
          name: "Subject",
          value: ticket.subject.slice(0, 1024),
        });
      }

      await opener.send({
        embeds: [dmEmbed],
        nonce: ticketResolutionNonce(
          "td",
          apiTicketNumber,
          persisted?.resolutionVersion,
        ),
        enforceNonce: true,
      });
      dmDelivered = true;
      if (persisted) {
        const dmMarker = await apiUpdateTicket({
          discordChannelId: channel.id,
          action: "resolution-dm-delivered",
        });
        if (!dmMarker) {
          console.warn(
            `Ticket #${paddedNum} DM was sent, but its delivery marker did not persist.`,
          );
        }
      }
    }
  } catch (err) {
    console.warn(
      `Ticket #${paddedNum} final resolution DM failed; the bot will retry it:`,
      err,
    );
  }

  if (channelClosed) {
    // Notify openers of merged source tickets that the merged ticket is now closed
    const mergedFromIds = (ticket.mergedFromUserIds ?? []).filter(
      (id) => id !== ticket.userId && id !== closer.id,
    );
    for (const mergedUserId of mergedFromIds) {
      try {
        const mergedUser = await closer.client.users.fetch(mergedUserId);
        const header = `A ticket your earlier ticket was merged into has been closed by ${closer.user.tag}.\n\n${
          resolutionMessage ? "**Resolution**\n" : ""
        }`;
        const maxRes = Math.max(0, 4096 - header.length);
        const mergedDm = new EmbedBuilder()
          .setTitle(`Ticket #${paddedNum} closed`)
          .setColor(0x95a5a6)
          .setDescription(
            receiptUrl
              ? appendReceiptLink(
                  `${header}${resolutionMessage ? resolutionMessage.slice(0, maxRes) : ""}`.trim(),
                  receiptUrl,
                  4096,
                )
              : `${header}${resolutionMessage ? resolutionMessage.slice(0, maxRes) : ""}`.trim(),
          )
          .setFooter({ text: "ahousedividedgame.com" })
          .setTimestamp();

        await mergedUser.send({ embeds: [mergedDm] });
      } catch (err) {
        console.warn(`Merged-ticket close DM to ${mergedUserId} failed:`, err);
      }
    }
  }

  // The transcript and player DM preserve the outcome after channel deletion.
  if (channelClosed) removeTicket(guild.id, channel.id);
  return {
    ticketUpdated: Boolean(persisted),
    receiptLinkAvailable: Boolean(receiptUrl),
    channelReceiptDelivered,
    channelClosed,
    dmDelivered,
  };
}

export async function handleClaimTicket(
  channel: TextChannel,
  claimer: GuildMember,
  interaction: ButtonInteraction | ChatInputCommandInteraction,
): Promise<void> {
  const guild = channel.guild;
  let ticket = getTicketByChannel(guild.id, channel.id);
  const channelNumber = Number(
    channel.name.match(/^ticket-[a-z0-9-]+-(\d+)$/i)?.[1],
  );
  if (
    /^ticket-[a-z0-9-]+-\d+$/i.test(channel.name) &&
    (!ticket || ticket.ticketNumber !== channelNumber)
  ) {
    await reconcileTicketChannels(guild);
    ticket = getTicketByChannel(guild.id, channel.id);
  }

  if (!ticket) {
    const msg = "This channel is not a ticket.";
    if (interaction.replied || interaction.deferred)
      await interaction.followUp({ content: msg, ephemeral: true });
    else await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  if (!memberCanActAsTicketStaff(claimer, channel)) {
    const msg = "Only moderators and admins can claim tickets.";
    if (interaction.replied || interaction.deferred)
      await interaction.followUp({ content: msg, ephemeral: true });
    else await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  if (ticket.claimedByUserId) {
    const msg = `This ticket is already claimed by <@${ticket.claimedByUserId}>.`;
    if (interaction.replied || interaction.deferred)
      await interaction.followUp({ content: msg, ephemeral: true });
    else await interaction.reply({ content: msg, ephemeral: true });
    return;
  }

  claimTicket(guild.id, channel.id, claimer.id);

  // Find the embed message and update it
  let embedMessage: Message | undefined;
  if ("message" in interaction && interaction.message) {
    embedMessage = interaction.message as Message;
  } else if (ticket.embedMessageId) {
    embedMessage = await channel.messages
      .fetch(ticket.embedMessageId)
      .catch(() => undefined);
  }

  if (embedMessage?.embeds[0]) {
    const updated = EmbedBuilder.from(embedMessage.embeds[0]).addFields({
      name: "Claimed by",
      value: `<@${claimer.id}>`,
      inline: true,
    });
    await embedMessage
      .edit({ embeds: [updated], components: [buildTicketActionRow(true)] })
      .catch(() => {});
  }

  // Surface the claim in the channel so everyone in the ticket can see who claimed it
  const claimMsg = `🙋 <@${claimer.id}> has claimed this ticket.`;

  if ("message" in interaction && interaction.message) {
    // Button interaction — deferUpdate was called by the caller; use followUp
    await interaction.followUp({ content: claimMsg });
  } else {
    await interaction.reply({ content: claimMsg });
  }
}

export async function handleTicketCloseModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.guild || !interaction.channelId) {
    await interaction.reply({
      content: "This can only be used inside a server ticket channel.",
      ephemeral: true,
    });
    return;
  }

  const channelId = interaction.customId.slice(
    TICKET_CLOSE_MODAL_PREFIX.length,
  );
  if (channelId !== interaction.channelId) {
    await interaction.reply({
      content: "This form does not match the current channel.",
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "Ticket channel not found.",
      ephemeral: true,
    });
    return;
  }
  const textChannel = channel as TextChannel;

  const closer =
    interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);

  let ticket = getTicketByChannel(interaction.guild.id, channelId);
  const channelNumber = Number(
    textChannel.name.match(/^ticket-[a-z0-9-]+-(\d+)$/i)?.[1],
  );
  if (
    /^ticket-[a-z0-9-]+-\d+$/i.test(textChannel.name) &&
    (!ticket || ticket.ticketNumber !== channelNumber)
  ) {
    await reconcileTicketChannels(interaction.guild);
    ticket = getTicketByChannel(interaction.guild.id, channelId);
  }
  if (!ticket) {
    await interaction.reply({
      content: "This ticket is already closed or is not a ticket channel.",
      ephemeral: true,
    });
    return;
  }

  if (!canCloseTicket(closer, textChannel, ticket.userId)) {
    await interaction.reply({
      content: "You don't have permission to close this ticket.",
      ephemeral: true,
    });
    return;
  }

  const resolutionRaw = interaction.fields.getTextInputValue(
    "ticket_resolution_message",
  );
  const resolutionMessage = resolutionRaw.trim();
  const staffClosingOther = isStaffClosingSomeoneElsesTicket(
    closer,
    textChannel,
    ticket.userId,
  );
  if (staffClosingOther && !resolutionMessage) {
    await interaction.reply({
      content:
        "Staff must enter a resolution message so the ticket opener can be notified.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await finalizeTicketClose(
      textChannel,
      closer,
      ticket,
      resolutionMessage,
    );
    let reply: string;
    if (result.alreadyInProgress) {
      reply = "This ticket is already being closed.";
    } else if (!result.channelClosed) {
      reply =
        "The channel could not be closed. Please retry; the staff transcript records the outcome.";
    } else if (!result.ticketUpdated) {
      reply =
        "Ticket closed in Discord. Backend sync failed and the staff transcript is flagged for reconciliation.";
    } else if (!result.dmDelivered) {
      reply = "Ticket closed. The opener's final DM will be retried.";
    } else {
      reply = "Ticket closed. The opener was sent the final outcome via DM.";
    }
    await interaction.editReply({ content: reply });
  } catch (err) {
    console.error("Ticket close finalize error:", err);
    await interaction.editReply({
      content: "Something went wrong while closing the ticket. Check the logs.",
    });
  }
}

export async function closeTicket(
  channel: TextChannel,
  closer: GuildMember,
  interaction?: ButtonInteraction | ChatInputCommandInteraction,
): Promise<void> {
  const guild = channel.guild;
  const ticket = getTicketByChannel(guild.id, channel.id);

  if (!ticket) {
    // Older releases renamed closed channels and removed their local ticket
    // record. Staff can finish closing these orphaned channels.
    if (
      channel.name.startsWith("closed-ticket-") &&
      memberCanActAsTicketStaff(closer, channel)
    ) {
      await channel.delete("Finish closing a legacy ticket channel");
      if (interaction) {
        if (interaction.replied || interaction.deferred)
          await interaction.followUp({
            content: "Ticket channel closed.",
            ephemeral: true,
          });
        else
          await interaction.reply({
            content: "Ticket channel closed.",
            ephemeral: true,
          });
      }
      return;
    }
    const msg = "This channel is not a ticket.";
    if (interaction) {
      if (interaction.replied || interaction.deferred)
        await interaction.followUp({ content: msg, ephemeral: true });
      else await interaction.reply({ content: msg, ephemeral: true });
    } else {
      await channel.send(msg).catch(() => {});
    }
    return;
  }

  if (!canCloseTicket(closer, channel, ticket.userId)) {
    const msg = "You don't have permission to close this ticket.";
    if (interaction) {
      if (interaction.replied || interaction.deferred)
        await interaction.followUp({ content: msg, ephemeral: true });
      else await interaction.reply({ content: msg, ephemeral: true });
    } else {
      await channel.send(msg).catch(() => {});
    }
    return;
  }

  // Slash command or Close Ticket button → resolution modal immediately
  if (interaction) {
    await interaction.showModal(buildTicketCloseModal(channel.id));
    return;
  }

  // 🔒 reaction path — confirm in channel, then modal
  const confirmEmbed = new EmbedBuilder()
    .setTitle("Close Ticket?")
    .setDescription(
      "Are you sure you want to close this ticket? A transcript will be saved. You will be asked for a resolution message next.",
    )
    .setColor(0xed4245);

  const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close_confirm")
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ticket_close_cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  const confirmMsg = await channel.send({
    embeds: [confirmEmbed],
    components: [confirmRow],
  });

  const collector = confirmMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (btn) => btn.user.id === closer.id,
    time: 30_000,
    max: 1,
  });

  collector.on("collect", async (btn) => {
    if (btn.customId === "ticket_close_cancel") {
      const cancelledEmbed = new EmbedBuilder()
        .setTitle("Close Ticket?")
        .setDescription("Close cancelled.")
        .setColor(0x5865f2);
      await btn.update({ embeds: [cancelledEmbed], components: [] });
      return;
    }

    await btn.showModal(buildTicketCloseModal(channel.id));
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      const timedOutEmbed = new EmbedBuilder()
        .setTitle("Close Ticket?")
        .setDescription("Close timed out.")
        .setColor(0x5865f2);
      confirmMsg
        .edit({ embeds: [timedOutEmbed], components: [] })
        .catch(() => {});
    }
  });
}

// ─── Ticket Merging ─────────────────────────────────────────────────────────

export const TICKET_MERGE_MODAL_PREFIX = "ticket_merge_modal_";

export interface MergeResult {
  success: boolean;
  reason?: string;
}

export async function mergeTickets(
  sourceChannel: TextChannel,
  targetChannel: TextChannel,
  sourceTicket: NonNullable<ReturnType<typeof getTicketByChannel>>,
  targetTicket: NonNullable<ReturnType<typeof getTicketByChannel>>,
  staffMember: GuildMember,
  reason: string,
): Promise<MergeResult> {
  const guild = sourceChannel.guild;
  const sourceConfig = CATEGORY_CONFIG[sourceTicket.category];
  const targetConfig = CATEGORY_CONFIG[targetTicket.category];
  const sourcePadded = String(sourceTicket.ticketNumber).padStart(4, "0");
  const targetPadded = String(targetTicket.ticketNumber).padStart(4, "0");

  try {
    // 1. Grant source user access to target channel
    await targetChannel.permissionOverwrites.edit(sourceTicket.userId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });

    // 2. Copy messages from source to target
    const messages = await fetchAllMessages(sourceChannel, 100);
    const headerEmbed = new EmbedBuilder()
      .setTitle(`📎 Merged from Ticket #${sourcePadded}`)
      .setColor(sourceConfig.color)
      .setDescription(
        `**${sourceConfig.emoji} ${sourceConfig.label} #${sourcePadded}** (opened by <@${sourceTicket.userId}>) has been merged into this ticket.\n**Reason:** ${reason}`,
      )
      .setFooter({ text: `Merged by ${staffMember.user.tag}` })
      .setTimestamp();

    if (sourceTicket.subject) {
      headerEmbed.addFields({
        name: "Original Subject",
        value: sourceTicket.subject,
      });
    }

    await targetChannel.send({ embeds: [headerEmbed] });

    // Collect all messages into transcript chunks (no pings)
    const lines: string[] = [];
    for (const msg of messages) {
      if (msg.author.bot && msg.embeds.length > 0) continue; // skip bot embeds (initial ticket embed, etc.)
      if (!msg.content && msg.embeds.length === 0 && msg.attachments.size === 0)
        continue;

      const ts = msg.createdAt.toISOString().slice(0, 19).replace("T", " ");
      // Use the user's tag/username instead of mention to avoid pings
      const author = msg.author.tag ?? msg.author.username ?? msg.author.id;
      let content = msg.content || "";
      if (msg.attachments.size > 0) {
        const attachLinks = [...msg.attachments.values()]
          .map((a) => a.url)
          .join(" ");
        content = content ? `${content}\n${attachLinks}` : attachLinks;
      }
      lines.push(`**[${ts}] ${author}:** ${content}`);
    }

    // Send transcript as embed(s), 4000-char chunks, mentions disabled
    if (lines.length > 0) {
      const chunks: string[] = [];
      let current = "";
      for (const line of lines) {
        if (current.length + line.length + 1 > 4000) {
          chunks.push(current);
          current = line;
        } else {
          current = current ? `${current}\n${line}` : line;
        }
      }
      if (current) chunks.push(current);

      for (let i = 0; i < chunks.length; i++) {
        const transcriptEmbed = new EmbedBuilder()
          .setTitle(
            chunks.length > 1
              ? `Transcript (${i + 1}/${chunks.length})`
              : "Transcript",
          )
          .setDescription(chunks[i])
          .setColor(sourceConfig.color);
        await targetChannel
          .send({
            embeds: [transcriptEmbed],
            allowedMentions: { parse: [] },
          })
          .catch(() => {});
      }
    }

    // 3. Notify original opener (single ping)
    await targetChannel.send({
      content: `<@${sourceTicket.userId}> Your ticket has been merged here — please continue the conversation in this channel.`,
      allowedMentions: { users: [sourceTicket.userId] },
    });

    // 4. DM the source opener
    try {
      const sourceUser = await guild.client.users.fetch(sourceTicket.userId);
      const dmEmbed = new EmbedBuilder()
        .setTitle(`Ticket #${sourcePadded} Merged`)
        .setColor(sourceConfig.color)
        .setDescription(
          `Your **${sourceConfig.label}** ticket has been merged into **${targetConfig.label} #${targetPadded}**.\n\n**Reason:** ${reason}\n\nPlease continue the conversation here: <#${targetChannel.id}>`,
        )
        .setFooter({ text: "ahousedividedgame.com" })
        .setTimestamp();

      if (sourceTicket.subject) {
        dmEmbed.addFields({
          name: "Your Original Subject",
          value: sourceTicket.subject,
        });
      }

      await sourceUser.send({ embeds: [dmEmbed] });
    } catch {
      // DMs may be disabled
    }

    // 5. Log the merge
    const logChannelId =
      process.env.TICKET_LOG_CHANNEL_ID ?? "1483974417628270593";
    const logChannel = guild.channels.cache.get(logChannelId) as
      TextChannel | undefined;
    if (logChannel) {
      const mergeEmbed = new EmbedBuilder()
        .setTitle(`📎 Ticket Merged — #${sourcePadded} → #${targetPadded}`)
        .setColor(0x5865f2)
        .addFields(
          {
            name: "Source",
            value: `#${sourcePadded} (${sourceConfig.label}) — <@${sourceTicket.userId}>`,
            inline: true,
          },
          {
            name: "Target",
            value: `#${targetPadded} (${targetConfig.label})`,
            inline: true,
          },
          { name: "Merged by", value: `<@${staffMember.id}>`, inline: true },
          { name: "Reason", value: reason },
        )
        .setFooter({ text: "ahousedividedgame.com" })
        .setTimestamp();

      if (sourceTicket.subject) {
        mergeEmbed.addFields({
          name: "Original Subject",
          value: sourceTicket.subject,
        });
      }

      await logChannel.send({ embeds: [mergeEmbed] }).catch(() => {});
    }

    // 6. Record the merge on the target ticket so closure DMs reach the source opener
    const mergedIds = new Set<string>(targetTicket.mergedFromUserIds ?? []);
    if (sourceTicket.userId !== targetTicket.userId) {
      mergedIds.add(sourceTicket.userId);
    }
    // Also carry forward any users from a chain of merges into the source ticket
    for (const id of sourceTicket.mergedFromUserIds ?? []) {
      if (id !== targetTicket.userId) mergedIds.add(id);
    }
    addTicket(guild.id, {
      ...targetTicket,
      mergedFromUserIds: [...mergedIds],
    });

    // 7. Remove source ticket from store and delete channel
    removeTicket(guild.id, sourceTicket.channelId);
    await sourceChannel
      .delete(
        `Ticket #${sourcePadded} merged into #${targetPadded} by ${staffMember.user.tag}`,
      )
      .catch(() => {});

    return { success: true };
  } catch (error) {
    console.error("Error merging tickets:", error);
    return {
      success: false,
      reason: "An unexpected error occurred while merging the tickets.",
    };
  }
}

export async function handlePanelReaction(
  reaction: MessageReaction,
  user: User,
  guild: Guild,
): Promise<void> {
  if (!isPanel(guild.id, reaction.message.id)) return;

  // Remove user's reaction to keep panel clean
  await reaction.users.remove(user.id).catch(() => {});

  const emojiName = reaction.emoji.name;
  if (!emojiName || !(emojiName in PANEL_EMOJI_MAP)) return;
  const category = PANEL_EMOJI_MAP[emojiName];

  const result = await createTicket(guild, user.id, user.username, category);

  // Notify via DM (reactions can't reply ephemerally)
  try {
    if (result.success) {
      await user.send(
        `Your ${category} ticket has been created: <#${result.channelId}>`,
      );
    } else {
      await user.send(result.reason);
    }
  } catch {
    // DMs disabled — ticket channel itself is the notification
  }
}

export async function handleLockReaction(
  reaction: MessageReaction,
  user: User,
  guild: Guild,
): Promise<void> {
  if (reaction.emoji.name !== "🔒") return;

  const ticket = getTicketByChannel(guild.id, reaction.message.channel.id);
  if (!ticket) return;

  const member =
    guild.members.cache.get(user.id) ?? (await guild.members.fetch(user.id));
  if (!member) return;

  await closeTicket(reaction.message.channel as TextChannel, member);
}
