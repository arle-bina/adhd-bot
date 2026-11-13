// Encoding of Lakeside catalog choices into Discord autocomplete values.
// A value is "<scope>:<productId>", for example "product:canada",
// "tier:supporter-plus" or "everything:" (no product id).

export interface CatalogChoice {
  label: string;
  scope: string;
  productId?: string;
}

export interface DecodedChoice {
  scope: string;
  productId?: string;
}

export const MAX_AUTOCOMPLETE_CHOICES = 25;

export function encodeChoice(choice: Pick<CatalogChoice, "scope" | "productId">): string {
  return `${choice.scope}:${choice.productId ?? ""}`;
}

export function decodeChoice(value: string): DecodedChoice | null {
  const idx = value.indexOf(":");
  if (idx <= 0) return null;
  const scope = value.slice(0, idx).trim();
  const productId = value.slice(idx + 1).trim();
  if (!scope) return null;
  return productId ? { scope, productId } : { scope };
}

/** Filter by what the user typed and cap at Discord's 25 choice limit. */
export function filterChoices(
  choices: CatalogChoice[],
  typed: string,
): { name: string; value: string }[] {
  const needle = typed.trim().toLowerCase();
  return choices
    .filter((c) => !needle || c.label.toLowerCase().includes(needle))
    .slice(0, MAX_AUTOCOMPLETE_CHOICES)
    .map((c) => ({ name: c.label.slice(0, 100), value: encodeChoice(c).slice(0, 100) }));
}

export interface GrantLike {
  id?: string;
  _id?: string;
  label?: string;
  productLabel?: string;
  scope?: string;
  productId?: string;
}

/** Autocomplete choices for active grants; the value is the grant id. */
export function grantChoices(grants: GrantLike[]): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const g of grants) {
    const id = g.id ?? g._id;
    if (!id) continue;
    const name = g.label ?? g.productLabel ?? [g.scope, g.productId].filter(Boolean).join(": ") ?? id;
    out.push({ name: (name || id).slice(0, 100), value: id.slice(0, 100) });
  }
  return out;
}
