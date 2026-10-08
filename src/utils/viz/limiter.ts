/**
 * Concurrency cap for chart rendering.
 *
 * Card drawing is synchronous node-canvas work, but the async entry points also
 * fetch avatars and hold large canvases in memory while they wait. A burst of
 * chart commands must queue behind a small pool instead of piling up, and an
 * overlong queue is refused fast so the event loop stays responsive.
 */

export const RENDER_MAX_CONCURRENT = Math.max(1, Number(process.env.RENDER_MAX_CONCURRENT || 2));
export const RENDER_MAX_QUEUE = 24;

export class RenderBusyError extends Error {
  constructor() {
    super("Chart renderer queue is full");
    this.name = "RenderBusyError";
  }
}

let active = 0;
const waiting: Array<() => void> = [];

export async function withRenderSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= RENDER_MAX_CONCURRENT) {
    if (waiting.length >= RENDER_MAX_QUEUE) throw new RenderBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    active++;
  }
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

export const _renderTesting = { getActive: () => active, getWaiting: () => waiting.length };
