import { describe, expect, it } from "vitest";
import {
  buildFilingQuestionsMessage,
  ticketNumberFromChannelName,
} from "../src/utils/tickets.js";

describe("filing questions", () => {
  it("keeps the full context prompt, including platform, with clear confirmation wording", () => {
    const message = buildFilingQuestionsMessage([
      "Link your game account.",
      "Confirm the affected page.",
      "Confirm the corporation.",
      "Confirm platform and client version.",
      "This extra item is outside the prompt limit.",
    ]);

    expect(message).toContain(
      "Please confirm these details so we can investigate:",
    );
    expect(message).toContain("Confirm platform and client version.");
    expect(message).not.toContain("outside the prompt limit");
    expect(message).not.toContain("one more detail");
  });
});

describe("ticket channel numbering", () => {
  it("counts both open and closed Discord ticket channels", () => {
    expect(ticketNumberFromChannelName("ticket-bug-reporter-1439")).toBe(1439);
    expect(ticketNumberFromChannelName("closed-ticket-bug-reporter-1440")).toBe(
      1440,
    );
    expect(ticketNumberFromChannelName("general")).toBeNull();
  });
});

describe("incident tickets", () => {
  it("maps the incident category onto the backend incident category", async () => {
    const { toGameCategory } = await import("../src/utils/tickets.js");
    expect(toGameCategory("incident")).toBe("incident");
    expect(toGameCategory("mechanics")).toBe("gameplay");
  });

  it("treats only moderators, developers and channel managers as incident staff", async () => {
    const { memberIsTicketStaff } = await import("../src/utils/tickets.js");
    process.env.DEV_TEAM_ROLE_ID = "dev-role";
    process.env.SERVER_MODERATOR_ID = "mod-role";
    const member = (perms: string[], roles: string[]) => ({
      permissions: { has: (flag: bigint) => perms.some((p) => (({ Administrator: 8n, ManageChannels: 16n, ModerateMembers: 1099511627776n }) as Record<string, bigint>)[p] === flag) },
      roles: { cache: { has: (id: string) => roles.includes(id) } },
    });
    expect(memberIsTicketStaff(member([], []) as never)).toBe(false);
    expect(memberIsTicketStaff(member([], ["dev-role"]) as never)).toBe(true);
    expect(memberIsTicketStaff(member([], ["mod-role"]) as never)).toBe(true);
    expect(memberIsTicketStaff(member(["ManageChannels"], []) as never)).toBe(true);
    expect(memberIsTicketStaff(member(["Administrator"], []) as never)).toBe(true);
  });
});
