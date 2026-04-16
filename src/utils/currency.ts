// Currency constants, formatting, and conversion for forex-aware displays.

import { apiFetchPublic } from "./api-base.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD",
  UK: "GBP",
  JP: "JPY",
  CA: "CAD",
  DE: "EUR",
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "\u00a3",
  JPY: "\u00a5",
  CAD: "C$",
  EUR: "\u20ac",
};

/** For discord.js `.addChoices()` on slash command string options. */
export const CURRENCY_CHOICES: Array<{ name: string; value: string }> = [
  { name: "USD ($)", value: "USD" },
  { name: "GBP (\u00a3)", value: "GBP" },
  { name: "JPY (\u00a5)", value: "JPY" },
  { name: "CAD (C$)", value: "CAD" },
  { name: "EUR (\u20ac)", value: "EUR" },
];

/** Maps stock exchange codes to their home currency. */
export const EXCHANGE_CURRENCY: Record<string, string> = {
  nyse: "USD",
  ftse: "GBP",
  nikkei: "JPY",
  tsx: "CAD",
  dax: "EUR",
  global: "USD",
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Map a countryId to its currency code. Falls back to "USD". */
export function currencyFor(countryId: string | null | undefined): string {
  return (countryId && COUNTRY_CURRENCY[countryId]) || "USD";
}

/** Map a currency code to its display symbol. Falls back to "$". */
export function symbolFor(currencyCode: string): string {
  return CURRENCY_SYMBOLS[currencyCode] || "$";
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Format a monetary amount with the currency symbol, no decimal places. */
export function formatCurrency(amount: number | null | undefined, currencyCode: string): string {
  const n = amount ?? 0;
  const sym = symbolFor(currencyCode);
  return sym + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Format a share price with 2 decimal places. */
export function formatSharePrice(amount: number | null | undefined, currencyCode: string): string {
  const n = amount ?? 0;
  const sym = symbolFor(currencyCode);
  return sym + n.toFixed(2);
}

/** Format a monetary amount with +/- sign prefix (for income/change displays). */
export function formatCurrencySigned(amount: number | null | undefined, currencyCode: string): string {
  const n = amount ?? 0;
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(n), currencyCode)}`;
}

/** Right-align a currency amount string to a fixed width for code blocks. */
export function padCurrency(label: string, amount: number | null | undefined, width: number, currencyCode: string): string {
  const val = formatCurrency(amount, currencyCode);
  return `${label}${val.padStart(width)}`;
}

// ---------------------------------------------------------------------------
// Forex rate fetching (cached)
// ---------------------------------------------------------------------------

interface ForexRatesResponse {
  rates: Record<string, number>;
  baseRates?: Record<string, number>;
}

let cachedRates: Record<string, number> | null = null;
let cachedBaseRates: Record<string, number> | null = null;
let cacheExpiry = 0;
const RATE_CACHE_TTL_MS = 60_000;

export interface ForexData {
  rates: Record<string, number>;
  baseRates: Record<string, number>;
}

/**
 * Fetch current forex rates from the game API. Cached for 60 seconds.
 * Returns rates & baseRates: currencyCode → rate (local currency per 1 internal unit).
 */
export async function fetchForexRates(): Promise<Record<string, number>> {
  if (cachedRates && Date.now() < cacheExpiry) return cachedRates;

  try {
    const res = await apiFetchPublic<ForexRatesResponse>("/api/forex/rates");
    cachedRates = res.rates;
    cachedBaseRates = res.baseRates ?? {};
    cacheExpiry = Date.now() + RATE_CACHE_TTL_MS;
    return cachedRates;
  } catch {
    // If rates unavailable, return identity rates (everything = 1.0)
    return cachedRates ?? { USD: 1, GBP: 1, JPY: 1, CAD: 1, EUR: 1 };
  }
}

/**
 * Fetch current forex rates and baseRates from the game API. Cached for 60 seconds.
 */
export async function fetchForexData(): Promise<ForexData> {
  await fetchForexRates(); // populate cache
  return {
    rates: cachedRates ?? { USD: 1, GBP: 1, JPY: 1, CAD: 1, EUR: 1 },
    baseRates: cachedBaseRates ?? {},
  };
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Convert an amount from one currency to another using forex rates.
 * Rates are "local currency per 1 internal unit."
 * Conversion: amount / rates[from] * rates[to]
 */
// ---------------------------------------------------------------------------
// Forex-aware footer helpers
// ---------------------------------------------------------------------------

/**
 * Produce a footer suffix showing the exchange rate for a non-anchor currency.
 * Returns empty string for anchor (USD / rate=1) since no conversion context needed.
 * Example: "1 INT = £0.7500 GBP" for GBP, "" for USD.
 */
export function forexSuffix(currencyCode: string, rates: Record<string, number>): string {
  const rate = rates[currencyCode];
  if (!rate || rate === 1) return "";
  const sym = symbolFor(currencyCode);
  const formatted = currencyCode === "JPY" ? rate.toFixed(2) : rate.toFixed(4);
  return `1 INT = ${sym}${formatted} ${currencyCode}`;
}

export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>,
): number {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = rates[fromCurrency] ?? 1;
  const toRate = rates[toCurrency] ?? 1;
  return (amount / fromRate) * toRate;
}
