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
