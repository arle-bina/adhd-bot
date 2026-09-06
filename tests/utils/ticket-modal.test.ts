import { describe, it, expect } from "vitest";
import type { ModalSubmitInteraction } from "discord.js";
import {
  buildLegacyTicketModal,
  buildTicketModal,
  readTicketModalFields,
  ticketModalId,
} from "../../src/utils/ticketModal.js";
import {
  TICKET_PLATFORMS,
  categoryNeedsPlatform,
  formatTicketPlatform,
  isTicketPlatform,
} from "../../src/utils/ticketPlatform.js";

type ModalJson = ReturnType<ReturnType<typeof buildTicketModal>["toJSON"]>;

/** Discord serialises a select inside a modal as a label component wrapping type 3. */
function platformComponent(json: ModalJson) {
  return json.components.find((c) => "component" in c && c.component.type === 3);
}

describe("ticket modal", () => {
  it("asks bug reporters which platform they are on", () => {
    const json = buildTicketModal("bug").toJSON();
    const label = platformComponent(json);
    expect(label).toBeDefined();
    const select = label!.component as { custom_id: string; required?: boolean; options: { value: string }[] };
    expect(select.custom_id).toBe("ticket_platform");
    expect(select.required).toBe(true);
    expect(select.options.map((o) => o.value)).toEqual([
      "mobile_web",
      "mobile_android",
      "desktop_web",
      "desktop_client",
      "desktop_singleplayer",
    ]);
  });

  it("does not ask on moderation or mechanics tickets", () => {
    expect(platformComponent(buildTicketModal("moderation").toJSON())).toBeUndefined();
    expect(platformComponent(buildTicketModal("mechanics").toJSON())).toBeUndefined();
    expect(categoryNeedsPlatform("bug")).toBe(true);
    expect(categoryNeedsPlatform("moderation")).toBe(false);
    expect(categoryNeedsPlatform("mechanics")).toBe(false);
  });

  it("keeps subject and description on every category", () => {
    for (const category of ["bug", "moderation", "mechanics"] as const) {
      const ids = buildTicketModal(category)
        .toJSON()
        .components.map((c) => ("component" in c ? c.component.custom_id : undefined));
      expect(ids).toContain("ticket_subject");
      expect(ids).toContain("ticket_description");
    }
  });

  it("keeps the custom id stable so /ticket's awaitModalSubmit filter still matches", () => {
    expect(ticketModalId("bug")).toBe("ticket_modal_bug");
    expect(buildTicketModal("bug").toJSON().custom_id).toBe("ticket_modal_bug");
    expect(buildLegacyTicketModal("bug").toJSON().custom_id).toBe("ticket_modal_bug");
  });

  it("falls back to a text-only modal that Discord has always accepted", () => {
    const json = buildLegacyTicketModal("bug").toJSON();
    // Action rows (type 1) wrapping text inputs (type 4), no label components.
    expect(json.components.every((c) => c.type === 1)).toBe(true);
    expect(json.components).toHaveLength(2);
  });
});

function fakeSubmit(fields: {
  text?: Record<string, string>;
  select?: Record<string, string[]>;
}): ModalSubmitInteraction {
  return {
    fields: {
      getTextInputValue(id: string) {
        const value = fields.text?.[id];
        if (value === undefined) throw new Error(`no text field ${id}`);
        return value;
      },
      getStringSelectValues(id: string) {
        const value = fields.select?.[id];
        if (value === undefined) throw new Error(`no select field ${id}`);
        return value;
      },
    },
  } as unknown as ModalSubmitInteraction;
}

describe("readTicketModalFields", () => {
  it("reads the platform the reporter picked", () => {
    const result = readTicketModalFields(
      fakeSubmit({
        text: { ticket_subject: "Map will not load", ticket_description: "Stuck on spinner" },
        select: { ticket_platform: ["mobile_android"] },
      }),
    );
    expect(result).toEqual({
      subject: "Map will not load",
      description: "Stuck on spinner",
      platform: "mobile_android",
    });
  });

  it("survives a modal with no platform select and no description", () => {
    const result = readTicketModalFields(fakeSubmit({ text: { ticket_subject: "Rule question" } }));
    expect(result).toEqual({ subject: "Rule question", description: undefined, platform: undefined });
  });

  it("drops a platform value it does not recognise", () => {
    const result = readTicketModalFields(
      fakeSubmit({ text: { ticket_subject: "s" }, select: { ticket_platform: ["playstation"] } }),
    );
    expect(result.platform).toBeUndefined();
  });
});

describe("platform labels", () => {
  it("labels every option and passes unknown values through", () => {
    for (const p of TICKET_PLATFORMS) {
      expect(isTicketPlatform(p.value)).toBe(true);
      expect(formatTicketPlatform(p.value)).toBe(p.label);
    }
    expect(isTicketPlatform("playstation")).toBe(false);
    expect(formatTicketPlatform("playstation")).toBe("playstation");
  });

  it("stays inside Discord's select option limits", () => {
    expect(TICKET_PLATFORMS.length).toBeLessThanOrEqual(25);
    for (const p of TICKET_PLATFORMS) {
      expect(p.label.length).toBeLessThanOrEqual(100);
      expect(p.description.length).toBeLessThanOrEqual(100);
      expect(p.value.length).toBeLessThanOrEqual(100);
    }
  });
});
