import { describe, expect, it } from "vitest";
import { data } from "../../src/commands/ask.js";

describe("/ask command definition", () => {
  it("accepts an optional Discord user as the live-data subject", () => {
    const command = data.toJSON();
    const user = command.options?.find((option) => option.name === "user");

    expect(user).toMatchObject({
      name: "user",
      description: "Discord user whose linked game profile the question is about",
      required: false,
    });
  });
});

describe("/ask feedback controls", () => {
  it("renders enabled, rated, and expired button states", async () => {
    const { askActions } = await import("../../src/utils/ask-presentation.js");
    const fresh = askActions("123").toJSON();
    expect(fresh.components.map(c => (c as { disabled?: boolean }).disabled ?? false)).toEqual([false, false, false]);

    const rated = askActions("123", { ratingDisabled: true, ratedLabel: "up" }).toJSON();
    expect(rated.components.map(c => (c as { disabled?: boolean }).disabled)).toEqual([true, true, undefined].map(Boolean));
    expect((rated.components[0] as { label?: string }).label).toBe("Recorded");

    const expired = askActions("123", { allDisabled: true }).toJSON();
    expect(expired.components.every(c => (c as { disabled?: boolean }).disabled)).toBe(true);
  });

  it("keeps the collector honest: no click cap, scoped filter, disabled on end, truthful failure copy", async () => {
    const source = await import("node:fs").then(fs => fs.readFileSync("src/utils/ask-runtime.ts", "utf8"));
    expect(source).not.toMatch(/max:\s*3/);
    expect(source).toMatch(/filter: button => button\.customId\.endsWith/);
    expect(source).toMatch(/collector\.on\("end"/);
    expect(source).toMatch(/FEEDBACK_FAILED/);
    expect(source).toMatch(/sent\?\.ok/);
  });
});
