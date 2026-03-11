interface CharacterResult {
  id: string;
  name: string;
  party: string;
  partyColor: string;
  state: string;
  stateCode: string;
  position: string;
  avatarUrl: string | null;
  discordAvatarUrl: string | null;
  profileUrl: string;
}

interface LookupResponse {
  found: boolean;
  characters: CharacterResult[];
}

export async function lookupByName(name: string): Promise<LookupResponse> {
  const url = new URL("/api/discord-bot/lookup", process.env.GAME_API_URL);
  url.searchParams.set("name", name);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function lookupByDiscordId(discordId: string): Promise<LookupResponse> {
  const url = new URL("/api/discord-bot/lookup", process.env.GAME_API_URL);
  url.searchParams.set("discordId", discordId);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// --- Leaderboard ---

export interface LeaderboardCharacter {
  rank: number;
  id: string;
  name: string;
  party: string;
  partyColor: string;
  stateCode: string;
  position: string;
  politicalInfluence: number;
  favorability: number;
  profileUrl: string;
}

interface LeaderboardResponse {
  found: boolean;
  metric: "politicalInfluence" | "favorability";
  characters: LeaderboardCharacter[];
}

export async function getLeaderboard(params: {
  metric?: string;
  country?: string;
  limit?: number;
}): Promise<LeaderboardResponse> {
  const url = new URL("/api/discord-bot/leaderboard", process.env.GAME_API_URL);
  if (params.metric) url.searchParams.set("metric", params.metric);
  if (params.country) url.searchParams.set("country", params.country);
  if (params.limit != null) url.searchParams.set("limit", String(params.limit));

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// --- Party ---

interface PartyTopMember {
  id: string;
  name: string;
  position: string;
  politicalInfluence: number;
  profileUrl: string;
}

interface PartyData {
  id: string;
  name: string;
  abbreviation: string;
  color: string;
  economicPosition: number;
  socialPosition: number;
  memberCount: number;
  treasury: number;
  chairName: string | null;
  partyUrl: string;
  topMembers: PartyTopMember[];
}

interface PartyResponse {
  found: boolean;
  party?: PartyData;
}

export async function getParty(id: string): Promise<PartyResponse> {
  const url = new URL("/api/discord-bot/party", process.env.GAME_API_URL);
  url.searchParams.set("id", id);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}
