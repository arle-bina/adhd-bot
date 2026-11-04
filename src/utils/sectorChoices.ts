/**
 * Sector choices shared by /marketshare and /sectors.
 *
 * Values must match the game's OPERATING_SECTOR_TYPES. Automobiles and
 * entertainment were folded into the manufacturing_vehicles and
 * media_entertainment lanes (migration 2026-10-05); the API rejects the old
 * values with a 400.
 */
export const SECTOR_CHOICES = [
  { name: "Financial", value: "financial" },
  { name: "Media", value: "media" },
  { name: "Manufacturing", value: "manufacturing" },
  { name: "Chemical Industries", value: "chemical_industries" },
  { name: "Healthcare", value: "healthcare" },
  { name: "Retail", value: "retail" },
  { name: "Automobiles", value: "manufacturing_vehicles" },
  { name: "Technology", value: "technology" },
  { name: "Energy", value: "energy" },
  { name: "Agriculture", value: "agriculture" },
  { name: "Real Estate", value: "real_estate" },
  { name: "Construction", value: "construction" },
  { name: "Defense", value: "defense" },
  { name: "Telecommunications", value: "telecommunications" },
  { name: "Entertainment", value: "media_entertainment" },
  { name: "Logistics", value: "logistics" },
  { name: "Extraction", value: "extraction" },
] as const;

/** Retired values that old command registrations or callers may still send. */
const LEGACY_SECTOR_ALIASES: Record<string, string> = {
  automobiles: "manufacturing_vehicles",
  entertainment: "media_entertainment",
};

export function normalizeSectorType(value: string): string {
  return LEGACY_SECTOR_ALIASES[value] ?? value;
}
