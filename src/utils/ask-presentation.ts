import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export interface AskPresentationSource {
  kind: "knowledge" | "state";
  label: string;
}

export interface AskPresentationResponse {
  files?: string[];
  sources?: AskPresentationSource[];
  citations?: Array<string | { path?: string; label?: string }>;
  liveSources?: Array<string | { label?: string }>;
}

export function asksForSources(question: string): boolean {
  return /\b(?:source|sources|citation|citations|code source|which files?|evidence)\b/i.test(question);
}

// Discord needs a way to inspect grounding without turning every answer into
// a developer transcript or triggering a wall of GitHub previews.
export function compactSources(result: AskPresentationResponse): string {
  const live = result.liveSources || result.sources || [];
  const labels = live.slice(0, 2)
    .map(source => (typeof source === "string" ? source : source.label || "").replace(/\s*\([^)]*\)/g, "").trim())
    .filter(Boolean);
  if (labels.length) return labels.map(label => `• ${label}`).join("\n");
  const cited = (result.citations || []).map(citation =>
    typeof citation === "string" ? citation : citation.path || citation.label || "").filter(Boolean);
  return (cited.length ? cited : result.files || []).slice(0, 2)
    .map(file => `• \`${file.replace(/^\/+/, "")}\``).join("\n");
}

export interface AskActionState {
  ratingDisabled?: boolean;
  allDisabled?: boolean;
  ratedLabel?: string;
}

// The feedback button row for one Ask answer. Rendered fresh whenever its
// state changes: a recorded rating disables and relabels the rating buttons,
// and an expired collector disables everything so dead buttons never sit
// there looking clickable ("This interaction failed" reads as a bot error).
export function askActions(id: string, state: AskActionState = {}) {
  const ratingDisabled = Boolean(state.ratingDisabled || state.allDisabled);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ask-good:${id}`).setLabel(state.ratedLabel === "up" ? "Recorded" : "Helpful").setStyle(ButtonStyle.Success).setDisabled(ratingDisabled),
    new ButtonBuilder().setCustomId(`ask-report:${id}`).setLabel(state.ratedLabel === "down" ? "Reported" : "Report issue").setStyle(ButtonStyle.Danger).setDisabled(ratingDisabled),
    new ButtonBuilder().setCustomId(`ask-sources:${id}`).setLabel("Sources").setStyle(ButtonStyle.Secondary).setDisabled(Boolean(state.allDisabled)),
  );
}

export const FEEDBACK_FAILED = "I couldn't record that just now. Ask's feedback service didn't accept it; try the button again in a minute.";
