"use client";

import Link from "next/link";

import { US_STATES } from "./helpers";
import { UK_REGIONS } from "@/lib/constants/uk";
import { JP_REGIONS } from "@/lib/constants/japan";
import { deRegions } from "@/lib/seeds/de/deRegions";
import { cnRegions } from "@/lib/seeds/cn/cnRegions";
import { ieRegions } from "@/lib/seeds/ie/ieRegions";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { regionPartyUrl } from "@/lib/urls";

function getRegionsForCountry(countryId: string): [string, string][] {
  if (countryId === COUNTRY_CONFIGS.UK.id) return UK_REGIONS.map((r) => [r.id, r.name]);
  if (countryId === COUNTRY_CONFIGS.JP.id) return JP_REGIONS.map((r) => [r.id, r.name]);
  if (countryId === COUNTRY_CONFIGS.DE.id) return deRegions.map((r) => [r._id, r.name]);
  if (countryId === COUNTRY_CONFIGS.CN.id) return cnRegions.map((r) => [r._id, r.name]);
  if (countryId === COUNTRY_CONFIGS.IE.id) return ieRegions.map((r) => [r._id, r.name]);
  return US_STATES;
}

export function StatePartyLinksTab({
  partyId,
  partyColor: _partyColor,
  countryId,
}: {
  partyId: string;
  partyColor: string;
  countryId: string;
}) {
  const config = COUNTRY_CONFIGS[countryId as CountryId] ?? COUNTRY_CONFIGS.US;
  const regions = getRegionsForCountry(countryId);

  const description = `The national party operates across ${regions.length} ${config.regionLabelPlural.toLowerCase()}. Select a ${config.regionLabel.toLowerCase()} to view its local organization, leadership elections, and treasury.`;

  const getHref = (abbr: string) => regionPartyUrl(countryId, abbr, partyId);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-card-border bg-card-muted/50 p-4 flex items-start gap-3">
        <svg
          className="h-5 w-5 text-muted shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm text-muted leading-relaxed">{description}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {regions.map(([abbr, name]) => (
          <Link
            key={abbr}
            href={getHref(abbr)}
            className="group relative flex items-center gap-3 rounded-xl border border-card-border bg-card p-3 transition-all hover:border-primary/50 hover:shadow-md hover:bg-card-elevated hover:-translate-y-0.5"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card-muted text-xs font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
              {abbr}
            </div>

            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                {name}
              </span>
            </div>

            <svg
              className="h-4 w-4 text-muted/30 group-hover:text-primary/50 transition-colors shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ))}\n      </div>\n    </div>\n  );\n}