// Centralized formatting functions and constants for game concepts.

export function formatElectionType(type: string): string {
  const map: Record<string, string> = {
    senate: "Senate",
    house: "House",
    stateSenate: "State Senate",
    governor: "Governor",
    president: "Presidential",
    vicePresident: "Vice Presidential",
    commons: "Commons",
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
  };
  return map[type] ?? type;
}

export function formatOfficeType(type: string): string {
  const map: Record<string, string> = {
    governor: "Governor",
    senate: "Senator",
    house: "Representative",
    stateSenate: "State Senator",
    president: "President",
    vicePresident: "Vice President",
    commons: "MP",
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
  premier: "🇨🇦",
  ministerPresident: "🇩🇪",
};

export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  UK: "United Kingdom",
  JP: "Japan",
  CA: "Canada",
  DE: "Germany",
};

export const COUNTRY_FLAG: Record<string, string> = {
  US: "🇺🇸",
  UK: "🇬🇧",
  JP: "🇯🇵",
  CA: "🇨🇦",
  DE: "🇩🇪",
};

export const COUNTRY_COLORS: Record<string, number> = {
  US: 0x3c5a9a,
  UK: 0x9a3c3c,
  CA: 0xd52b1e,
  DE: 0xffcc00,
  JP: 0xbc002d,
};

export const EXCHANGE_LABELS: Record<string, string> = {
  global: "Global Stock Market",
  nyse: "NYSE",
  ftse: "FTSE",
  nikkei: "Nikkei",
  tsx: "TSX",
  dax: "DAX",
};
