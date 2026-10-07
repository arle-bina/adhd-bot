import { describe, it, expect, vi } from "vitest";
import { handleFeatureComponent } from "../src/utils/featureComponents.js";

type Arg = Parameters<typeof handleFeatureComponent>[0];

describe("handleFeatureComponent", () => {
  it("ignores non feat_ ids without touching the interaction", async () => {
    const deferUpdate = vi.fn();
    const handled = await handleFeatureComponent({ customId: "ticket_close", deferUpdate } as unknown as Arg);
    expect(handled).toBe(false);
    expect(deferUpdate).not.toHaveBeenCalled();
  });

  it("claims unknown feat_ ids and tells the user", async () => {
    const followUp = vi.fn();
    const handled = await handleFeatureComponent({
      customId: "feat_nope:1",
      deferUpdate: vi.fn(),
      editReply: vi.fn(),
      followUp,
    } as unknown as Arg);
    expect(handled).toBe(true);
    expect(followUp).toHaveBeenCalled();
  });
});
