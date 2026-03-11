import { describe, it, expect } from "vitest";
import { ideologyLabel } from "../../src/commands/party.js";

describe("ideologyLabel", () => {
  it("returns Centrist for center economic and center social", () => {
    expect(ideologyLabel(0, 0)).toBe("Centrist");
  });

  it("returns Left-Liberal for far left economic and liberal social", () => {
    expect(ideologyLabel(-50, -50)).toBe("Left-Liberal");
  });

  it("returns Right-Conservative for far right economic and conservative social", () => {
    expect(ideologyLabel(50, 50)).toBe("Right-Conservative");
  });

  it("returns Left-Conservative for far left economic and conservative social", () => {
    expect(ideologyLabel(-50, 50)).toBe("Left-Conservative");
  });

  it("returns Right-Liberal for far right economic and liberal social", () => {
    expect(ideologyLabel(50, -50)).toBe("Right-Liberal");
  });

  it("returns Left when only economic position is left", () => {
    expect(ideologyLabel(-50, 0)).toBe("Left");
  });

  it("returns Right when only economic position is right", () => {
    expect(ideologyLabel(50, 0)).toBe("Right");
  });

  it("returns Liberal when only social position is liberal", () => {
    expect(ideologyLabel(0, -50)).toBe("Liberal");
  });

  it("returns Conservative when only social position is conservative", () => {
    expect(ideologyLabel(0, 50)).toBe("Conservative");
  });
});
