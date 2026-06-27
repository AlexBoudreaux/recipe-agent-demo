/**
 * UnitConverter — deterministic, same-dimension unit conversion plus serving
 * scaling. This is the correctness-critical "trust" module: an LLM never does
 * the math here.
 *
 * Hard rule from the PRD: conversion is ONLY within a single dimension
 * (volume<->volume, weight<->weight). A cross-dimension request (e.g. cups to
 * grams) needs per-ingredient density we deliberately do not have, so instead
 * of fabricating a number we return the value UNCHANGED.
 */
import type { Dimension, Unit } from "./types";

/**
 * Conversion factors expressed as "how many base units is one of this unit".
 * Base unit for volume is the milliliter; for weight it is the gram. Count-like
 * and unitless tokens have no factor and are never converted, only scaled.
 *
 * US customary volumes (the cooking convention this app targets).
 */
const VOLUME_TO_ML: Record<string, number> = {
  tsp: 4.92892159375,
  tbsp: 14.78676478125,
  "fl oz": 29.5735295625,
  cup: 236.5882365,
  pint: 473.176473,
  quart: 946.352946,
  gallon: 3785.411784,
  ml: 1,
  l: 1000,
};

const WEIGHT_TO_G: Record<string, number> = {
  oz: 28.349523125,
  lb: 453.59237,
  g: 1,
  kg: 1000,
};

/** Resolve which dimension a unit belongs to. Unknown/unitless => "count". */
export function dimensionOf(unit: Unit): Dimension {
  if (unit in VOLUME_TO_ML) return "volume";
  if (unit in WEIGHT_TO_G) return "weight";
  return "count";
}

/** True only when both units share a convertible dimension (volume or weight). */
export function isSameDimension(from: Unit, to: Unit): boolean {
  const dim = dimensionOf(from);
  if (dim === "count") return false;
  return dim === dimensionOf(to);
}

/** A quantity paired with its unit. The unit of currency for this module. */
export interface Measure {
  quantity: number;
  unit: Unit;
}

/**
 * Convert a measure to a target unit.
 *
 * Returns a NEW measure in `to` units when the conversion is same-dimension.
 * When it is not (cross-dimension, or either side is count/unitless), returns
 * the ORIGINAL measure unchanged rather than fabricating a value. Callers can
 * detect a refused conversion by checking whether `unit` changed.
 */
export function convert(measure: Measure, to: Unit): Measure {
  const { quantity, unit } = measure;
  if (unit === to) return { quantity, unit };
  if (!isSameDimension(unit, to)) {
    return { quantity, unit };
  }
  const table = dimensionOf(unit) === "volume" ? VOLUME_TO_ML : WEIGHT_TO_G;
  const inBase = quantity * table[unit];
  return { quantity: inBase / table[to], unit: to };
}

/**
 * Scale a raw quantity by a factor. Pure multiply; the unit never changes.
 * Used for serving scaling where unit conversion is not wanted.
 */
export function scaleQuantity(quantity: number, factor: number): number {
  return quantity * factor;
}

/**
 * Scale a measure for a serving change. `factor = targetServings / baseServings`.
 * Quantity scales; unit is preserved.
 */
export function scaleMeasure(measure: Measure, factor: number): Measure {
  return { quantity: measure.quantity * factor, unit: measure.unit };
}

/**
 * Compute the multiplicative factor to go from a base serving count to a
 * target. Guards against a zero/negative base by returning 1 (no-op scale).
 */
export function servingFactor(baseServings: number, targetServings: number): number {
  if (baseServings <= 0) return 1;
  return targetServings / baseServings;
}
