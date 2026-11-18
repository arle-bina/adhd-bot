// Centralized formatting functions and constants for game concepts.

export function formatElectionType(type: string, countryId?: string | null): string {
  if (countryId?.toUpperCase() === "CA" && type === "governor") return "Premier";
  const map: Record<string, string> = {
    senate: "Senate",
    house: "House",
    stateSenate: "State Senate",
    governor: "Governor",
    president: "Presidential",
    vicePresident: "Vice Presidential",
    commons: "Commons",
    caCommons: "House of Commons",
    snap_caCommons: "Snap House of Commons",
    provincialLegislature: "Provincial Legislature",
    primeMinister: "Prime Minister",
    chancellor: "Chancellor",
    shugiin: "Shūgiin",
    sangiin: "Sangiin",
    bundestag: "Bundestag",
    snap_commons: "Snap Commons",
    snap_shugiin: "Snap Shūgiin",
    snap_bundestag: "Snap Bundestag",
    centralBankChair: "Central Bank Chair",
    regionalCouncil: "Regional Council",
    premier: "Premier",
    ministerPresident: "Minister-President",
    npcDelegate: "National People's Congress",
    peoplesCongress: "Provincial People's Congress",
    landtag: "Landtag",
    taoiseach: "Taoiseach",
    dail: "Dáil",
    snap_dail: "Snap Dáil",
    uachtaran: "Uachtarán",
    localCouncil: "Local Council",
    chamber: "Chamber of Deputies",
  };
  return map[type] ?? type;
}

export function formatOfficeType(type: string, countryId?: string | null): string {
  if (countryId?.toUpperCase() === "CA" && type === "governor") return "Premier";
  const map: Record<string, string> = {
    governor: "Governor",
    senate: "Senator",
    house: "Representative",
    stateSenate: "State Senator",
    president: "President",
    vicePresident: "Vice President",
    commons: "MP",
    caCommons: "MP",
    snap_caCommons: "MP",
    provincialLegislature: "Member of the Provincial Legislature",
    primeMinister: "Prime Minister",
    chancellor: "Chancellor",
    shugiin: "Representative",
    sangiin: "Councillor",
    bundestag: "MdB",
    snap_commons: "MP",
    snap_shugiin: "Representative",
    snap_bundestag: "MdB",
    centralBankChair: "Central Bank Chair",
    regionalCouncil: "Regional Councillor",
    premier: "Premier",
    ministerPresident: "Minister-President",
    taoiseach: "Taoiseach",
    tanaiste: "Tánaiste",
    uachtaran: "Uachtarán",
    npcDelegate: "NPC Delegate",
    peoplesCongress: "Provincial Delegate",
    landtag: "MdL",
    dail: "TD",
    snap_dail: "TD",
    localCouncil: "Councillor",
    chamber: "Federal Deputy",
    // RU (Soviet Union) and DD (East Germany). Fallbacks only — the game API
    // supplies the authoritative label where it has one.
    supremeSovietDeputy: "Supreme Soviet Deputy",
    nationalitiesDeputy: "Nationalities Deputy",
    chairmanOfPresidium: "Chairman of the Presidium",
    republicSupremeSoviet: "Republic Deputy",
    generalSecretary: "General Secretary",
    volkskammerDeputy: "Deputy",
  };
  return map[type] ?? type;
}

export const RACE_EMOJI: Record<string, string> = {
  senate: "🏛️",
  house: "🏠",
  stateSenate: "🏢",
  governor: "👔",
  president: "🇺🇸",
  vicePresident: "🇺🇸",
  caCommons: "🇨🇦",
  snap_caCommons: "🇨🇦",
  provincialLegislature: "🇨🇦",
  commons: "🇬🇧",
  snap_commons: "🇬🇧",
  primeMinister: "🇬🇧",
  chancellor: "🇩🇪",
  shugiin: "🇯🇵",
  sangiin: "🇯🇵",
  snap_shugiin: "🇯🇵",
  bundestag: "🇩🇪",
  snap_bundestag: "🇩🇪",
  centralBankChair: "🏦",
  regionalCouncil: "🏛️",
  premier: "🇨🇳",
  ministerPresident: "🇩🇪",
  npcDelegate: "🇨🇳",
  peoplesCongress: "🇨🇳",
  taoiseach: "🇮🇪",
  dail: "🇮🇪",
  snap_dail: "🇮🇪",
  uachtaran: "🇮🇪",
  localCouncil: "🇮🇪",
  landtag: "🇩🇪",
  chamber: "🇧🇷",
};

export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  UK: "United Kingdom",
  DE: "Germany",
  JP: "Japan",
  IE: "Ireland",
  BR: "Brazil",
  CN: "China",
  NG: "Nigeria",
  // Must match the Discord role names exactly — roles are resolved by name.
  RU: "Soviet Union",
  DD: "East Germany",
};

export const COUNTRY_FLAG: Record<string, string> = {
  US: "🇺🇸",
  CA: "🇨🇦",
  UK: "🇬🇧",
  DE: "🇩🇪",
  JP: "🇯🇵",
  IE: "🇮🇪",
  BR: "🇧🇷",
  CN: "🇨🇳",
  NG: "🇳🇬",
  RU: "🚩",
  DD: "🏴",
};

/**
 * Emoji for a race. Several office keys are shared across countries — `premier`
 * belongs to both CN and RU — so a country id, when known, wins over the
 * race-keyed map. Falls back to the map, then to a generic ballot box.
 *
 * Declared after COUNTRY_FLAG so the reference is initialised at module load.
 */
export function raceEmoji(electionType: string, countryId?: string): string {
  if (countryId && COUNTRY_FLAG[countryId]) return COUNTRY_FLAG[countryId];
  return RACE_EMOJI[electionType] ?? "🗳️";
}

export const COUNTRY_COLORS: Record<string, number> = {
  US: 0x3c5a9a,
  CA: 0xd80621,
  UK: 0x9a3c3c,
  DE: 0xffcc00,
  JP: 0xbc002d,
  IE: 0x009a44,
  BR: 0x009c3b,
  CN: 0xde2910,
  NG: 0x008751,
  RU: 0xcc0000,
  DD: 0xffce00,
};

export const EXCHANGE_LABELS: Record<string, string> = {
  global: "Global Stock Market",
  nyse: "NYSE",
  tsx: "TSX",
  ftse: "FTSE",
  dax: "DAX",
  nikkei: "Nikkei",
  iseq: "ISEQ",
  b3: "B3",
  sse: "SSE",
};
