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
