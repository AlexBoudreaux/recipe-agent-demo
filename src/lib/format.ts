/**
 * Small display-formatting helpers shared across the recipe and technique cards.
 * Kept dependency-free so any card can import it.
 */

/**
 * Render an ingredient quantity the way a cook expects: 0.5 -> "1/2",
 * 1.5 -> "1 1/2", appending the unit unless it's the unitless "count". Returns
 * "" when the quantity is absent (mid-stream).
 */
export function quantityLabel(q?: number, unit?: string): string {
  if (q === undefined) return "";
  const whole = Math.floor(q);
  const frac = q - whole;
  const fracMap: Record<string, string> = {
    "0.25": "1/4",
    "0.5": "1/2",
    "0.75": "3/4",
    "0.33": "1/3",
    "0.67": "2/3",
  };
  const key = frac.toFixed(2);
  let amount: string;
  if (frac === 0) amount = `${whole}`;
  else if (fracMap[key]) amount = whole ? `${whole} ${fracMap[key]}` : fracMap[key];
  else amount = `${q}`;
  const u = unit && unit !== "count" ? ` ${unit}` : "";
  return `${amount}${u}`.trim();
}
