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
  /** Present when the account has several characters, so the answer can say which one it used. */
  characterCount?: number;
}

type LookupByDiscordId = (discordUserId: string) => Promise<LookupResponse>;

/**
 * Resolve a Discord user to game identity context without making Ask depend on
 * linking. An account can hold several characters; `preferredName` picks one
 * (case-insensitive, exact then prefix), otherwise the first is used and the
 * count is returned so the answer can disclose which character it assumed.
 */
export async function resolveAskIdentity(
  user: AskDiscordUser,
  lookup: LookupByDiscordId = lookupByDiscordId,
  preferredName?: string | null,
): Promise<AskIdentity | undefined> {
  try {
    const linked = await lookup(user.id);
    const characters = linked.found ? linked.characters : [];
    const wanted = String(preferredName || "").trim().toLowerCase();
    const character = (wanted
      ? characters.find(c => c.name.toLowerCase() === wanted)
        ?? characters.find(c => c.name.toLowerCase().startsWith(wanted))
      : undefined) ?? characters[0];
    if (!character) return undefined;

    return {
      discordUserId: user.id,
      discordUsername: user.username,
      characterId: character.id,
      characterName: character.name,
      country: character.countryId,
      corporationName: character.ceoOf,
      ...(characters.length > 1 ? { characterCount: characters.length } : {}),
    };
  } catch {
    return undefined;
  }
}

/** Names of a user's linked characters, for the `character` option autocomplete. */
export async function linkedCharacterNames(
  userId: string,
  lookup: LookupByDiscordId = lookupByDiscordId,
): Promise<string[]> {
  try {
    const linked = await lookup(userId);
    return linked.found ? linked.characters.map(c => c.name).filter(Boolean) : [];
  } catch {
    return [];
  }
}
