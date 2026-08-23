import { lookupByDiscordId, type LookupResponse } from "./api-politics.js";

export interface AskDiscordUser {
  id: string;
  username: string;
}

export interface AskIdentity {
  discordUserId: string;
  discordUsername: string;
  characterId: string;
  characterName: string;
  country: string | null;
  corporationName: string | null;
}

type LookupByDiscordId = (discordUserId: string) => Promise<LookupResponse>;

/** Resolve a Discord user to game identity context without making Ask depend on linking. */
export async function resolveAskIdentity(
  user: AskDiscordUser,
  lookup: LookupByDiscordId = lookupByDiscordId,
): Promise<AskIdentity | undefined> {
  try {
    const linked = await lookup(user.id);
    const character = linked.found ? linked.characters[0] : undefined;
    if (!character) return undefined;

    return {
      discordUserId: user.id,
      discordUsername: user.username,
      characterId: character.id,
      characterName: character.name,
      country: character.countryId,
      corporationName: character.ceoOf,
    };
  } catch {
    return undefined;
  }
}
