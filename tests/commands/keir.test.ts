import { afterEach, describe, expect, it, vi } from "vitest";
import { data } from "../../src/commands/keir.js";
import { callKeirDesk } from "../../src/utils/keirDesk.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/keir", () => {
  it("is a guild command with the desk's subcommands", () => {
    const json = data.toJSON();
    expect(json.name).toBe("keir");
    expect(json.dm_permission).toBe(false);
    const subs = (json.options ?? []) as Array<{ name: string; options?: Array<{ name: string; required?: boolean }> }>;
    expect(subs.map((s) => s.name)).toEqual([
      "doctor", "status", "waiting", "why", "nudge", "release", "pause", "resume", "model", "on", "off",
    ]);
    const ticketOf = (name: string) => subs.find((s) => s.name === name)?.options?.find((o) => o.name === "ticket");
    expect(ticketOf("doctor")?.required).toBe(false);
    expect(ticketOf("why")?.required).toBe(true);
    expect(ticketOf("status")).toBeUndefined();
    for (const sub of subs) expect(sub.options?.some((o) => o.name === "share")).toBe(true);
  });
});

describe("callKeirDesk", () => {
  const call = { sub: "doctor", options: { ticket: 12 }, member: { id: "1", roles: ["2"] } } as const;

  it("sends the caller's roles with the existing ops credential", async () => {
    vi.stubEnv("ASK_SECRET", "s3");
    vi.stubEnv("OPS_DASHBOARD_URL", "https://ops.example");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: "Fine.", ephemeral: false })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await callKeirDesk(call)).toEqual({ content: "Fine.", ephemeral: false });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ops.example/api/keir/desk/command");
    expect((init.headers as Record<string, string>)["X-Ask-Secret"]).toBe("s3");
    expect(JSON.parse(String(init.body))).toMatchObject({ command: "keir", sub: "doctor", member: { roles: ["2"] } });
  });

  it("keeps failures private and never throws", async () => {
    vi.stubEnv("ASK_SECRET", "s3");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 502 })));
    expect((await callKeirDesk(call)).ephemeral).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await callKeirDesk(call)).ephemeral).toBe(true);
    vi.stubEnv("ASK_SECRET", "");
    vi.stubEnv("ASK_API_SECRET", "");
    expect((await callKeirDesk(call)).content).toMatch(/not set up/);
  });

  it("treats a missing ephemeral flag as private", async () => {
    vi.stubEnv("ASK_SECRET", "s3");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: "x" }))));
    expect((await callKeirDesk(call)).ephemeral).toBe(true);
  });
});
