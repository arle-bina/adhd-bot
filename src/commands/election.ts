import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import {
  getElections,
  getRace,
  type Election,
  type RaceDetailResponse,
} from "../utils/api.js";
import { formatElectionType } from "./elections.js";
import { replyWithError } from "../utils/helpers.js";

export const cooldown = 5;

const RACE_EMOJI: Record<string, string> = {
  senate: "🏛️",
  house: "🏠",
  stateSenate: "🏢",
  governor: "👔",
  president: "🇺🇸",
  commons: "🇬🇧",
  primeMinister: "🇬🇧",
};

export const data = new SlashCommandBuilder()
  .setName("election")
  .setDescription("Browse elections or drill into a specific race")
  .addStringOption((o) =>
    o
      .setName("country")
      .setDescription("Country")
      .setRequired(true)
      .addChoices({ name: "United States", value: "US" }, { name: "United Kingdom", value: "UK" })
  )
  .addStringOption((o) =>
    o.setName("state").setDescription("State or constituency code (e.g. CA, SCO)").setRequired(false)
  )
  .addStringOption((o) =>
    o
      .setName("race")
      .setDescription("Race type")
      .setRequired(false)
      .addChoices(
        { name: "Senate", value: "senate" },
        { name: "House", value: "house" },
        { name: "State Senate", value: "stateSenate" },
        { name: "Governor", value: "governor" },
        { name: "President", value: "president" },
        { name: "Commons", value: "commons" },
        { name: "Prime Minister", value: "primeMinister" }
      )
  );

function voteBar(pct: number, width = 12): string {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

function ts(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

// --- List view ---

function buildListEmbed(elections: Election[], country: string, state?: string): EmbedBuilder {
  const subtitle = state ? ` · ${state}` : "";
  const lines = elections.slice(0, 25).map((e) => {
    const emoji = RACE_EMOJI[e.electionType] ?? "🗳️";
    const type = formatElectionType(e.electionType);
    const timeStr = e.endTime ? ` · ends <t:${ts(e.endTime)}:R>` : "";
    const seatIdStr = e.seatId ? ` · \`${e.seatId}\`` : "";
    const names =
      e.candidates.length > 0 ? e.candidates.map((c) => c.characterName).join(", ") : "No candidates yet";
    return `${emoji} **${type} — ${e.state}** (${e.status})${timeStr}${seatIdStr}\n${names}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`🗳️ Elections — ${country}${subtitle}`)
    .setColor(0x5865f2)
    .setDescription(lines.join("\n\n").slice(0, 4096))
    .setFooter({ text: "ahousedividedgame.com" });

  if (elections.length > 25) {
    embed.setFooter({ text: `Showing 25 of ${elections.length} · ahousedividedgame.com` });
  }

  return embed;
}

function buildSelectMenuRow(elections: Election[]): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const sliced = elections.slice(0, 25);
  if (sliced.length === 0) return null;

  const options = sliced.map((e) => {
    const type = formatElectionType(e.electionType);
    const label = `${type} — ${e.state}`.slice(0, 100);
    return new StringSelectMenuOptionBuilder().setLabel(label).setValue(e.id);
  });

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("election_select")
      .setPlaceholder("Pick a race for details…")
      .addOptions(options)
  );
}

// --- Detail view ---

function parseColor(hex: string | null | undefined): number {
  if (!hex) return 0x5865f2;
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  const parsed = parseInt(clean, 16);
  return isNaN(parsed) ? 0x5865f2 : parsed;
}

function leadingColor(detail: RaceDetailResponse): number {
  const snapshot = detail.votes?.latestSnapshot;
  let topId: string | null = null;
  let topPct = -1;

  if (snapshot) {
    for (const [id, pct] of Object.entries(snapshot.sharesPct)) {
      if (pct > topPct) {
        topPct = pct;
        topId = id;
      }
    }
  }

  const lead = topId ? detail.candidates.find((c) => c.id === topId) : detail.candidates[0];
  return parseColor(lead?.partyColor);
}

function buildDetailEmbed(detail: RaceDetailResponse): EmbedBuilder {
  const { election, phase, incumbent, candidates } = detail;
  const votes = detail.votes ?? ({} as typeof detail.votes);
  const emoji = RACE_EMOJI[election.electionType] ?? "🗳️";
  const type = formatElectionType(election.electionType);

  let phaseStr: string;
  if (phase.isUpcoming) {
    phaseStr = election.startTime
      ? `⏳ **Upcoming** — starts <t:${ts(election.startTime)}:R>`
      : "⏳ **Upcoming**";
  } else if (phase.inPrimary) {
    phaseStr = election.primaryEndTime
      ? `🟡 **Primary phase** — ends <t:${ts(election.primaryEndTime)}:R>`
      : "🟡 **Primary phase**";
  } else if (phase.inGeneral) {
    phaseStr = election.endTime
      ? `🟢 **General election** — ends <t:${ts(election.endTime)}:R>`
      : "🟢 **General election**";
  } else {
    phaseStr = "🏁 **Election complete**";
  }

  const lines: string[] = [phaseStr];

  if (incumbent) {
    lines.push(`Incumbent: **${incumbent.name}** (${incumbent.party})`);
  }

  lines.push("");

  if (candidates.length === 0) {
    lines.push("_No candidates have entered this race yet._");
  } else if (phase.inPrimary) {
    // Group candidates by party
    const byParty = new Map<string, typeof candidates>();
    for (const c of [...candidates].sort((a, b) => b.sharePct - a.sharePct)) {
      const group = byParty.get(c.party) ?? [];
      group.push(c);
      byParty.set(c.party, group);
    }
    for (const [party, members] of byParty) {
      lines.push(`**${party}**`);
      for (const c of members) {
        const npp = c.isNPP ? " 🤖" : "";
        const name = `[${c.characterName}](${c.profileUrl})${npp}`;
        lines.push(
          `${name} — Score: **${c.primaryScore}** · Share: ${c.sharePct.toFixed(1)}% · Fav: ${c.favorability}% · Funds: $${c.campaignFunds.toLocaleString()}`
        );
      }
      lines.push("");
    }
  } else {
    // General / ended / upcoming with candidates
    const snapshot = votes.latestSnapshot ?? null;
    const showVotes = (phase.inGeneral || phase.isEnded) && snapshot != null;
    const sorted = [...candidates].sort((a, b) => b.sharePct - a.sharePct);

    for (const c of sorted) {
      const npp = c.isNPP ? " 🤖" : "";
      const header = `**[${c.characterName}](${c.profileUrl})**${npp} · ${c.party}`;

      let voteLine = "";
      if (showVotes && snapshot) {
        const pct = snapshot.sharesPct[c.id] ?? c.sharePct;
        const count = snapshot.cumulativeVotes[c.id] ?? 0;
        voteLine = `\`${voteBar(pct)}\` **${pct.toFixed(1)}%** · ${count.toLocaleString()} votes`;
      }

      const evLine =
        votes.electoralVotes && votes.electoralVotes[c.id] != null
          ? ` · EV: ${votes.electoralVotes[c.id]}`
          : "";

      const stats = `PI: ${c.politicalInfluence} · Fav: ${c.favorability}% · Funds: $${c.campaignFunds.toLocaleString()} · Endorsements: ${c.endorsementCount}${evLine}`;

      const block = [header, voteLine, stats, c.runningMateName ? `Running mate: ${c.runningMateName}` : ""]
        .filter(Boolean)
        .join("\n");

      lines.push(block);
    }

    const totalVotes = votes.totalVotes ?? 0;
    if ((phase.inGeneral || phase.isEnded) && totalVotes > 0) {
      lines.push("");
      const seatStr = votes.seatsEstimate != null ? ` · Projected seats: ${votes.seatsEstimate}` : "";
      lines.push(`Total votes: **${totalVotes.toLocaleString()}**${seatStr}`);
    }
  }

  const cycleStr = election.cycle != null ? ` · Cycle ${election.cycle}` : "";
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${type} — ${election.stateName}${cycleStr}`.slice(0, 256))
    .setColor(leadingColor(detail))
    .setURL(election.url)
    .setDescription(lines.join("\n").slice(0, 4096))
    .setFooter({ text: election.seatId ? `Race ID: ${election.seatId}` : "ahousedividedgame.com" });

  return embed;
}

function buildDetailRow(electionUrl: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("back_to_list")
      .setLabel("← Back")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder().setLabel("View on Web").setStyle(ButtonStyle.Link).setURL(electionUrl)
  );
}

// --- Command ---

export async function execute(interaction: ChatInputCommandInteraction) {
  const country = interaction.options.getString("country", true);
  const state = interaction.options.getString("state") ?? undefined;
  const race = interaction.options.getString("race") ?? undefined;

  await interaction.deferReply();

  try {
    let listCache: Election[] | null = null;
    const raceCache = new Map<string, RaceDetailResponse>();

    async function fetchList(): Promise<Election[]> {
      if (listCache) return listCache;
      const res = await getElections({ country, state });
      listCache = res.elections;
      return listCache;
    }

    async function fetchDetail(params: {
      electionId?: string;
      race?: string;
    }): Promise<RaceDetailResponse | null> {
      const key = params.electionId ?? `${country}|${state}|${params.race}`;
      if (raceCache.has(key)) return raceCache.get(key)!;

      const res = await getRace(
        params.electionId
          ? { electionId: params.electionId }
          : { country, state, race: params.race }
      );

      if (res.mode !== "detail") return null;
      raceCache.set(key, res);
      return res;
    }

    let currentView: "list" | "detail" = race ? "detail" : "list";
    let currentDetail: RaceDetailResponse | null = null;

    let message;

    if (race) {
      currentDetail = await fetchDetail({ race });
      if (!currentDetail) {
        await interaction.editReply({ content: "Race not found." });
        return;
      }
      message = await interaction.editReply({
        embeds: [buildDetailEmbed(currentDetail)],
        components: [buildDetailRow(currentDetail.election.url)],
      });
    } else {
      const elections = await fetchList();
      if (elections.length === 0) {
        await interaction.editReply({ content: "No active or upcoming elections found." });
        return;
      }
      const menuRow = buildSelectMenuRow(elections);
      message = await interaction.editReply({
        embeds: [buildListEmbed(elections, country, state)],
        components: menuRow ? [menuRow] : [],
      });
    }

    const collector = message.createMessageComponentCollector({ time: 90_000 });

    collector.on("collect", async (component) => {
      if (component.user.id !== interaction.user.id) {
        await component.reply({ content: "This isn't your command.", ephemeral: true });
        return;
      }

      await component.deferUpdate();

      if (component.isStringSelectMenu() && component.customId === "election_select") {
        const electionId = component.values[0];
        const detail = await fetchDetail({ electionId });
        if (!detail) {
          await component.editReply({ content: "Failed to load race details." });
          return;
        }
        currentDetail = detail;
        currentView = "detail";
        await component.editReply({
          embeds: [buildDetailEmbed(detail)],
          components: [buildDetailRow(detail.election.url)],
        });
      } else if (component.isButton() && component.customId === "back_to_list") {
        const elections = await fetchList();
        const menuRow = buildSelectMenuRow(elections);
        currentView = "list";
        currentDetail = null;
        await component.editReply({
          embeds: [buildListEmbed(elections, country, state)],
          components: menuRow ? [menuRow] : [],
        });
      }
    });

    collector.on("end", async () => {
      if (currentView === "detail" && currentDetail) {
        await interaction
          .editReply({ components: [buildDetailRow(currentDetail.election.url, true)] })
          .catch(() => {});
      } else {
        await interaction.editReply({ components: [] }).catch(() => {});
      }
    });
  } catch (error) {
    await replyWithError(interaction, "election", error);
  }
}
