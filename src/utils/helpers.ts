import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ChatInputCommandInteraction,
} from "discord.js";

const DEFAULT_EMBED_COLOR = 0x5865f2; // Discord blurple
const ERROR_COLOR = 0xed4245; // Discord red
const ERRORS_PER_PAGE = 3;

export function hexToInt(hex: string | null | undefined): number {
  if (!hex) return DEFAULT_EMBED_COLOR;
  const parsed = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(parsed) ? DEFAULT_EMBED_COLOR : parsed;
}

// ---------------------------------------------------------------------------
// Error detail extraction
// ---------------------------------------------------------------------------

interface ErrorDetail {
  name: string;
  message: string;
  code: string | undefined;
  stack: string | undefined;
}

function extractDetail(error: unknown): ErrorDetail {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: (error as NodeJS.ErrnoException).code,
      stack: error.stack,
    };
  }
  return { name: "Error", message: String(error), code: undefined, stack: undefined };
}

/** Unwrap AggregateError (and nested ones) into a flat list of sub-errors. */
function collectErrors(error: unknown): ErrorDetail[] {
  const details: ErrorDetail[] = [];

  if (
    error instanceof Error &&
    "errors" in error &&
    Array.isArray((error as AggregateError).errors)
  ) {
    for (const sub of (error as AggregateError).errors) {
      // Recurse one level in case of nested AggregateErrors
      if (
        sub instanceof Error &&
        "errors" in sub &&
        Array.isArray((sub as AggregateError).errors)
      ) {
        for (const nested of (sub as AggregateError).errors) {
          details.push(extractDetail(nested));
        }
      } else {
        details.push(extractDetail(sub));
      }
    }
  }

  if (details.length === 0) {
    details.push(extractDetail(error));
  }

  return details;
}

/** Pull unique stack frames from our own code across all (sub-)errors. */
function buildStackExcerpt(error: unknown): string {
  const stacks: string[] = [];

  if (error instanceof Error && error.stack) stacks.push(error.stack);

  if (
    error instanceof Error &&
    "errors" in error &&
    Array.isArray((error as AggregateError).errors)
  ) {
    for (const sub of (error as AggregateError).errors) {
      if (sub instanceof Error && sub.stack) stacks.push(sub.stack);
    }
  }

  const seen = new Set<string>();
  const frames: string[] = [];
  for (const stack of stacks) {
    for (const line of stack.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.includes("/src/") && !seen.has(trimmed)) {
        seen.add(trimmed);
        frames.push(trimmed);
      }
    }
  }

  return frames.slice(0, 6).join("\n");
}

// ---------------------------------------------------------------------------
// Human-readable summary (used in embed title)
// ---------------------------------------------------------------------------

export function errorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const statusMatch = msg.match(/\b(\d{3})\b/);
  const code = statusMatch ? ` (${statusMatch[1]})` : "";

  if (msg.includes("401")) return `Bot configuration error${code} — contact an admin.`;
  if (msg.includes("400")) return `Invalid request${code} — check your inputs.`;
  if (msg.includes("API error")) return `Game API error${code}. Try again shortly.`;

  if (error instanceof Error && error.name === "TimeoutError") {
    return "The game server took too long to respond. Try again shortly.";
  }

  if (error instanceof TypeError && msg === "fetch failed") {
    return "Could not reach the game server. Try again shortly.";
  }

  // AggregateError — summarise the sub-errors instead of showing the useless wrapper message
  if (
    error instanceof Error &&
    "errors" in error &&
    Array.isArray((error as AggregateError).errors)
  ) {
    const subs = (error as AggregateError).errors as Error[];
    const codes = subs
      .map((e) => (e as NodeJS.ErrnoException).code)
      .filter(Boolean);
    if (codes.length > 0) {
      return `Network failure: ${[...new Set(codes)].join(", ")}`;
    }
    const subMsgs = subs.map((e) => (e instanceof Error ? e.message : String(e)));
    return `Multiple errors: ${subMsgs.join("; ").slice(0, 200)}`;
  }

  return `Unexpected error: ${msg.slice(0, 200)}`;
}

// ---------------------------------------------------------------------------
// Error embed builder
// ---------------------------------------------------------------------------

function buildErrorPages(
  command: string,
  summary: string,
  errors: ErrorDetail[],
  stackExcerpt: string,
): EmbedBuilder[] {
  const pages: EmbedBuilder[] = [];
  const totalErrors = errors.length;
  const totalPages = Math.max(1, Math.ceil(totalErrors / ERRORS_PER_PAGE));

  for (let p = 0; p < totalPages; p++) {
    const embed = new EmbedBuilder()
      .setColor(ERROR_COLOR)
      .setTitle(`/${command} — Error`)
      .setDescription(summary)
      .setTimestamp()
      .setFooter({
        text:
          totalPages > 1
            ? `Page ${p + 1}/${totalPages} · ${totalErrors} error(s) · ahousedividedgame.com`
            : `${totalErrors} error(s) · ahousedividedgame.com`,
      });

    const pageErrors = errors.slice(p * ERRORS_PER_PAGE, (p + 1) * ERRORS_PER_PAGE);

    for (let i = 0; i < pageErrors.length; i++) {
      const err = pageErrors[i];
      const idx = p * ERRORS_PER_PAGE + i + 1;
      const label = totalErrors > 1 ? `Error ${idx}/${totalErrors}` : "Details";

      const parts: string[] = [];
      parts.push(`**Type:** \`${err.name}\``);
      if (err.code) parts.push(`**Code:** \`${err.code}\``);
      parts.push(`**Message:** ${err.message.slice(0, 300)}`);

      embed.addFields({ name: label, value: parts.join("\n").slice(0, 1024) });
    }

    // Show stack excerpt on the first page
    if (p === 0 && stackExcerpt) {
      embed.addFields({
        name: "Stack Trace",
        value: `\`\`\`\n${stackExcerpt.slice(0, 900)}\n\`\`\``,
      });
    }

    pages.push(embed);
  }

  return pages;
}

function buildPageRow(
  currentPage: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("err_prev")
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId("err_next")
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === totalPages - 1),
  );
}

// ---------------------------------------------------------------------------
// Console logger (still useful for server-side logs)
// ---------------------------------------------------------------------------

export function logCommandError(command: string, error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[${command}] ${new Date().toISOString()} — ${msg}`);
  if (stack) console.error(stack);

  // Also log sub-errors for AggregateError
  if (
    error instanceof Error &&
    "errors" in error &&
    Array.isArray((error as AggregateError).errors)
  ) {
    for (const sub of (error as AggregateError).errors) {
      const subMsg = sub instanceof Error ? sub.message : String(sub);
      const subStack = sub instanceof Error ? sub.stack : undefined;
      console.error(`  ↳ ${subMsg}`);
      if (subStack) console.error(subStack);
    }
  }

  return errorMessage(error);
}

// ---------------------------------------------------------------------------
// Primary error reply — replaces all `interaction.editReply({ content: ... })`
// calls in command catch blocks. Sends a rich embed with full error detail and
// pagination buttons when there are many sub-errors.
// ---------------------------------------------------------------------------

export async function replyWithError(
  interaction: ChatInputCommandInteraction,
  command: string,
  error: unknown,
): Promise<void> {
  // Log to console
  logCommandError(command, error);

  // Build embed pages
  const errors = collectErrors(error);
  const stackExcerpt = buildStackExcerpt(error);
  const summary = errorMessage(error);
  const pages = buildErrorPages(command, summary, errors, stackExcerpt);

  if (pages.length === 1) {
    await interaction.editReply({ embeds: [pages[0]], content: "" });
    return;
  }

  // Paginated error display
  let page = 0;
  const message = await interaction.editReply({
    embeds: [pages[0]],
    components: [buildPageRow(0, pages.length)],
    content: "",
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
  });

  collector.on("collect", async (btn) => {
    if (btn.user.id !== interaction.user.id) {
      await btn.reply({ content: "This isn't your error report.", ephemeral: true });
      return;
    }

    await btn.deferUpdate();
    if (btn.customId === "err_prev") page = Math.max(0, page - 1);
    if (btn.customId === "err_next") page = Math.min(pages.length - 1, page + 1);
    await btn.editReply({
      embeds: [pages[page]],
      components: [buildPageRow(page, pages.length)],
    });
  });

  collector.on("end", () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}
