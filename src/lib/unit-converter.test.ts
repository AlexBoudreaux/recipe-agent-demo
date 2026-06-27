import { describe, it, expect } from "vitest";
import {
  convert,
  dimensionOf,
  isSameDimension,
  scaleQuantity,
  scaleMeasure,
  servingFactor,
  type Measure,
} from "./unit-converter";

describe("dimensionOf", () => {
  it("classifies volume units", () => {
    expect(dimensionOf("cup")).toBe("volume");
    expect(dimensionOf("ml")).toBe("volume");
    expect(dimensionOf("tbsp")).toBe("volume");
  });
  it("classifies weight units", () => {
    expect(dimensionOf("g")).toBe("weight");
    expect(dimensionOf("lb")).toBe("weight");
  });
  it("treats unitless / count tokens as count", () => {
    expect(dimensionOf("count")).toBe("count");
    expect(dimensionOf("clove")).toBe("count");
    expect(dimensionOf("")).toBe("count");
  });
});

describe("isSameDimension", () => {
  it("is true within volume and within weight", () => {
    expect(isSameDimension("cup", "ml")).toBe(true);
    expect(isSameDimension("lb", "g")).toBe(true);
  });
  it("is false across dimensions", () => {
    expect(isSameDimension("cup", "g")).toBe(false);
    expect(isSameDimension("oz", "ml")).toBe(false);
  });
  it("is false when either side is count/unitless", () => {
    expect(isSameDimension("clove", "g")).toBe(false);
    expect(isSameDimension("cup", "count")).toBe(false);
  });
});

describe("convert — same-dimension correctness", () => {
  it("converts cups to ml", () => {
    expect(convert({ quantity: 1, unit: "cup" }, "ml").quantity).toBeCloseTo(
      236.5882365,
      6,
    );
  });
  it("converts tbsp to tsp (1 tbsp = 3 tsp)", () => {
    const r = convert({ quantity: 1, unit: "tbsp" }, "tsp");
    expect(r.unit).toBe("tsp");
    expect(r.quantity).toBeCloseTo(3, 9);
  });
  it("converts cup to tbsp (1 cup = 16 tbsp)", () => {
    expect(convert({ quantity: 1, unit: "cup" }, "tbsp").quantity).toBeCloseTo(
      16,
      9,
    );
  });
  it("converts lb to g", () => {
    expect(convert({ quantity: 2, unit: "lb" }, "g").quantity).toBeCloseTo(
      907.18474,
      5,
    );
  });
  it("converts kg to oz", () => {
    expect(convert({ quantity: 1, unit: "kg" }, "oz").quantity).toBeCloseTo(
      35.27396195,
      5,
    );
  });
  it("returns same quantity when units already match", () => {
    expect(convert({ quantity: 7, unit: "g" }, "g")).toEqual({
      quantity: 7,
      unit: "g",
    });
  });
});

describe("convert — refuses cross-dimension (returns original UNCHANGED)", () => {
  it("does not convert volume to weight", () => {
    const orig: Measure = { quantity: 1, unit: "cup" };
    expect(convert(orig, "g")).toEqual(orig);
  });
  it("does not convert weight to volume", () => {
    const orig: Measure = { quantity: 8, unit: "oz" };
    expect(convert(orig, "ml")).toEqual(orig);
  });
  it("does not convert count/unitless to anything", () => {
    const orig: Measure = { quantity: 3, unit: "clove" };
    expect(convert(orig, "g")).toEqual(orig);
  });
  it("never fabricates a number for a refused conversion", () => {
    // The hallmark of a refusal: quantity is byte-identical, unit unchanged.
    const orig: Measure = { quantity: 1.5, unit: "cup" };
    const out = convert(orig, "kg");
    expect(out.quantity).toBe(1.5);
    expect(out.unit).toBe("cup");
  });
});

describe("convert — round-trips are stable", () => {
  it("cup -> ml -> cup recovers the original", () => {
    const there = convert({ quantity: 2.5, unit: "cup" }, "ml");
    const back = convert(there, "cup");
    expect(back.quantity).toBeCloseTo(2.5, 9);
    expect(back.unit).toBe("cup");
  });
  it("lb -> g -> lb recovers the original", () => {
    const there = convert({ quantity: 3, unit: "lb" }, "g");
    const back = convert(there, "lb");
    expect(back.quantity).toBeCloseTo(3, 9);
  });
  it("tsp -> tbsp -> tsp recovers the original", () => {
    const there = convert({ quantity: 9, unit: "tsp" }, "tbsp");
    const back = convert(there, "tsp");
    expect(back.quantity).toBeCloseTo(9, 9);
  });
});

describe("serving scaling", () => {
  it("scaleQuantity multiplies", () => {
    expect(scaleQuantity(4, 2)).toBe(8);
    expect(scaleQuantity(3, 0.5)).toBe(1.5);
  });
  it("scaleMeasure scales quantity and preserves unit", () => {
    expect(scaleMeasure({ quantity: 2, unit: "cup" }, 3)).toEqual({
      quantity: 6,
      unit: "cup",
    });
  });
  it("servingFactor computes target/base", () => {
    expect(servingFactor(4, 8)).toBe(2);
    expect(servingFactor(2, 3)).toBe(1.5);
  });
  it("servingFactor guards a zero/negative base with a no-op factor", () => {
    expect(servingFactor(0, 5)).toBe(1);
    expect(servingFactor(-2, 5)).toBe(1);
  });
  it("scaling a recipe 4->6 servings yields 1.5x quantities", () => {
    const f = servingFactor(4, 6);
    expect(scaleMeasure({ quantity: 2, unit: "cup" }, f).quantity).toBeCloseTo(
      3,
      9,
    );
  });
});
