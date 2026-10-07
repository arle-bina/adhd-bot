import { describe, it, expect } from "vitest";
import { withRenderSlot, RenderBusyError, RENDER_MAX_CONCURRENT, RENDER_MAX_QUEUE, _renderTesting } from "../../src/utils/viz/limiter.js";

describe("withRenderSlot", () => {
  it("never runs more than the cap at once and drains the queue", async () => {
    let running = 0;
    let peak = 0;
    const gates: Array<() => void> = [];
    const jobs = Array.from({ length: RENDER_MAX_CONCURRENT + 3 }, () =>
      withRenderSlot(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise<void>((r) => gates.push(r));
        running--;
      }),
    );
    await new Promise((r) => setTimeout(r, 5));
    expect(running).toBe(RENDER_MAX_CONCURRENT);
    while (_renderTesting.getActive() > 0 || gates.length) {
      gates.shift()?.();
      await new Promise((r) => setTimeout(r, 1));
    }
    await Promise.all(jobs);
    expect(peak).toBe(RENDER_MAX_CONCURRENT);
    expect(_renderTesting.getActive()).toBe(0);
  });

  it("rejects when the queue is full and releases slots on failure", async () => {
    const gates: Array<() => void> = [];
    const hold = () => withRenderSlot(() => new Promise<void>((r) => gates.push(r)));
    const held = Array.from({ length: RENDER_MAX_CONCURRENT + RENDER_MAX_QUEUE }, hold);
    await expect(withRenderSlot(async () => 1)).rejects.toBeInstanceOf(RenderBusyError);
    while (_renderTesting.getActive() > 0 || gates.length) {
      gates.shift()?.();
      await new Promise((r) => setTimeout(r, 1));
    }
    await Promise.all(held);
    await expect(withRenderSlot(async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(_renderTesting.getActive()).toBe(0);
  });
});
