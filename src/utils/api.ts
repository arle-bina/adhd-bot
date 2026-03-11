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
  nationalPoliticalInfluence: number;
  favorability: number;
  profileUrl: string;
}

export type LeaderboardMetric = "politicalInfluence" | "nationalPoliticalInfluence" | "favorability";

interface LeaderboardResponse {
  found: boolean;
  metric: LeaderboardMetric;
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

// --- Elections ---

interface ElectionCandidate {
  characterId: string;
  characterName: string;
  party: string;
  partyColor: string;
}

interface Election {
  id: string;
  electionType: string;
  state: string;
  status: "upcoming" | "active";
  startTime: string | null;
  endTime: string | null;
  candidates: ElectionCandidate[];
}

interface ElectionsResponse {
  found: boolean;
  elections: Election[];
}

export async function getElections(params: {
  country?: string;
  state?: string;
}): Promise<ElectionsResponse> {
  const url = new URL("/api/discord-bot/elections", process.env.GAME_API_URL);
  if (params.country) url.searchParams.set("country", params.country);
  if (params.state) url.searchParams.set("state", params.state);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// --- State ---

interface StateOfficial {
  officeType: string;
  characterId: string | null;
  characterName: string | null;
  party: string | null;
  partyColor: string;
  isNPP: boolean;
}

interface StateData {
  id: string;
  name: string;
  region: string;
  population: number;
  votingSystem: "fptp" | "rcv";
  stateUrl: string;
  officials: StateOfficial[];
}

interface StateResponse {
  found: boolean;
  state?: StateData;
}

export async function getState(id: string): Promise<StateResponse> {
  const url = new URL("/api/discord-bot/state", process.env.GAME_API_URL);
  url.searchParams.set("id", id);

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// --- News ---

interface NewsPost {
  id: string;
  title: string | null;
  content: string;
  authorName: string;
  isSystem: boolean;
  category: "election" | "legislation" | "executive" | "general" | null;
  stateId: string | null;
  reactions: { agree: number; disagree: number };
  createdAt: string;
  postUrl: string;
}

interface NewsResponse {
  found: boolean;
  posts: NewsPost[];
}

export async function getNews(params: {
  category?: string;
  limit?: number;
}): Promise<NewsResponse> {
  const url = new URL("/api/discord-bot/news", process.env.GAME_API_URL);
  if (params.category) url.searchParams.set("category", params.category);
  if (params.limit != null) url.searchParams.set("limit", String(params.limit));

  const response = await fetch(url.toString(), {
    headers: { "X-Bot-Token": process.env.GAME_API_KEY! },
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// --- Turn Status ---

export interface TurnStatus {
  currentTurn: number;
  currentYear: number;
  lastTurnProcessed: string;
  nextScheduledTurn: string;
}

export async function getTurnStatus(): Promise<TurnStatus> {
  const url = new URL("/api/game/turn/status", process.env.GAME_API_URL);

  const response = await fetch(url.toString());

  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}
