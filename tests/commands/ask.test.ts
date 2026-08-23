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
