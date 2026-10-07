// Single router for every `feat_` component interaction.
// Hook in src/index.ts (one line, inside the interaction handler):
//   if (interaction.isButton() && (await handleFeatureComponent(interaction))) return;

import type { ButtonInteraction, MessageComponentInteraction } from "discord.js";
import {
  buildCommodityDetail,
  buildCommodityList,
  buildCountryView,
  buildLegislationView,
  buildTurnView,
  buildWarsView,
  isLegMode,
  type FeaturePayload,
} from "./featureViews.js";
import { FEAT_PREFIX, isCountryTab, parseCountryCode, parseFeatId } from "./featureFormat.js";
import { logCommandError } from "./helpers.js";

const optCountry = (v: string | undefined): string | undefined => (v && v !== "-" ? parseCountryCode(v) ?? undefined : undefined);

async function build(kind: string, args: string[]): Promise<FeaturePayload | null> {
  switch (kind) {
    case "country": {
      const code = parseCountryCode(args[1]);
      return args[0] && isCountryTab(args[0]) && code ? buildCountryView(args[0], code) : null;
    }
    case "commodity":
      if (args[0] === "list") return buildCommodityList(optCountry(args[1]));
      if (args[0] === "detail" && args[1]) return buildCommodityDetail(args[1], optCountry(args[2]));
      return null;
    case "wars":
      return buildWarsView(Number(args[0] ?? 0), optCountry(args[1]));
    case "leg":
      return args[0] && isLegMode(args[0]) ? buildLegislationView(args[0], Number(args[1] ?? 0), optCountry(args[2])) : null;
    case "turn":
      return buildTurnView();
    default:
      return null;
  }
}

/** Returns true when the interaction belonged to a feature command and was handled. */
export async function handleFeatureComponent(interaction: MessageComponentInteraction | ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith(FEAT_PREFIX)) return false;
  const parsed = parseFeatId(interaction.customId);
  if (!parsed) return false;
  try {
    await interaction.deferUpdate();
    const payload = await build(parsed.kind, parsed.args);
    if (!payload) {
      await interaction.followUp({ content: "That control is no longer valid. Run the command again.", ephemeral: true });
      return true;
    }
    await interaction.editReply({ ...payload, attachments: [] });
  } catch (error) {
    logCommandError(`feat:${parsed.kind}`, error);
    try {
      await interaction.followUp({ content: "Could not refresh that view. Try again shortly.", ephemeral: true });
    } catch {
      /* interaction expired */
    }
  }
  return true;
}
