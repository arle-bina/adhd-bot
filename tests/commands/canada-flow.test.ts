import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
vi.mock("../../src/utils/api.js", async (original) => ({
  ...await original<typeof import("../../src/utils/api.js")>(),
  getGovernment: vi.fn(), getAutocomplete: vi.fn(), getState: vi.fn(),
}));
vi.mock("../../src/utils/countryChoices.js", () => ({ validateCountry: vi.fn(async () => ({ ok: true })), respondCountryAutocomplete: vi.fn() }));
import { getGovernment, getAutocomplete, getState } from "../../src/utils/api.js";
import { execute as government } from "../../src/commands/government.js";
import { autocomplete as electionAutocomplete } from "../../src/commands/election.js";
import { autocomplete as electionsAutocomplete } from "../../src/commands/elections.js";
import { autocomplete as stateAutocomplete, execute as state } from "../../src/commands/state.js";

function interaction(values: Record<string, string>) {
  return { user: { id: "test-user" }, options: { getString: (key: string) => values[key] ?? null }, deferReply: vi.fn(), editReply: vi.fn(), followUp: vi.fn() };
}
describe("Canada command flow", () => {
  beforeEach(() => vi.clearAllMocks());
  it("renders Canada's PM and cabinet with the Canadian flag", async () => {
    vi.mocked(getGovernment).mockResolvedValue({ found: true, country: "CA", countryName: "Canada", governmentFormation: null, officials: [
      { role: "Prime Minister", section: "executive", characterId: null, characterName: "Test PM", party: "Test Party", partyColor: "#d80621", profileUrl: null, isNPP: true },
      { role: "Minister of Finance", section: "cabinet", characterId: null, characterName: "Test Minister", party: "Test Party", partyColor: "#d80621", profileUrl: null, isNPP: true },
    ] });
    const command = interaction({ country: "CA" });
    await government(command as unknown as ChatInputCommandInteraction);
    expect(getGovernment).toHaveBeenCalledWith("CA");
    const embed = command.editReply.mock.calls[0][0].embeds[0].toJSON();
    expect(embed.title).toBe("🇨🇦 Government of Canada");
    expect(embed.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Cabinet", value: expect.stringContaining("Test Minister [NPC]") }),
    ]));
  });
  it("shows every Canadian cabinet member across Discord-safe pages", async () => {
    const officials = Array.from({ length: 19 }, (_, index) => ({
      role: `Minister of Department ${index}`,
      section: "cabinet" as const,
      characterId: null,
      characterName: `Cabinet Member ${index} ${"N".repeat(150)}`,
      party: "P".repeat(100), partyColor: "#d80621",
      profileUrl: `https://ahousedividedgame.com/profile/${index}`,
      isNPP: false,
    }));
    vi.mocked(getGovernment).mockResolvedValue({ found: true, country: "CA", countryName: "Canada", governmentFormation: null, officials });
    const command = interaction({ country: "CA" });
    await government(command as unknown as ChatInputCommandInteraction);
    const replies = [...command.editReply.mock.calls, ...command.followUp.mock.calls];
    expect(replies.length).toBeGreaterThan(1);
    const fields = replies.flatMap(([reply]) => {
      expect(reply.embeds[0].length).toBeLessThanOrEqual(6000);
      const pageFields = reply.embeds[0].toJSON().fields;
      expect(pageFields.length).toBeLessThanOrEqual(25);
      for (const field of pageFields) expect(field.value.length).toBeLessThanOrEqual(1024);
      return pageFields;
    });
    const text = fields.map(field => field.value).join("\n");
    for (const official of officials) expect(text).toContain(official.characterName);
  });
  it("shows pending formation even when no executive is seated yet", async () => {
    vi.mocked(getGovernment).mockResolvedValue({ found: true, country: "CA", countryName: "Canada", officials: [], governmentFormation: {
      status: "pending", formationType: null, pmName: null, pmCharacterId: null,
      governingPartyId: null, governingPartyName: null, coalitionPartyIds: null, coalitionPartyNames: null,
      totalSeats: 0, totalSeatsSupporting: 0, majorityThreshold: 172, seatsByParty: {}, seatsByPartyNames: {}, activeVoteId: null, pmVacancyDeadlineTurn: null,
    } });
    const command = interaction({ country: "CA" });
    await government(command as unknown as ChatInputCommandInteraction);
    expect(command.editReply.mock.calls[0][0].embeds[0].toJSON().fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "🏛️ Government Formation" }),
    ]));
  });
  it.each([electionAutocomplete, electionsAutocomplete, stateAutocomplete])("scopes province suggestions to the selected country", async autocomplete => {
    vi.mocked(getAutocomplete).mockResolvedValue({ results: [{ id: "CA_ON", name: "Ontario" }] });
    const command = { options: { getFocused: () => ({ name: "state", value: "on" }), getString: () => "CA" }, respond: vi.fn() };
    await autocomplete(command as unknown as AutocompleteInteraction);
    expect(getAutocomplete).toHaveBeenCalledWith({ type: "states", q: "on", country: "CA", limit: 25 });
    expect(command.respond).toHaveBeenCalledWith([{ name: "Ontario", value: "CA_ON" }]);
  });
  it("uses the API's Canadian office labels in province results", async () => {
    vi.mocked(getState).mockResolvedValue({ found: true, state: {
      id: "CA_ON", name: "Ontario", region: "Canada", population: 16000000, votingSystem: "fptp", stateUrl: "https://ahousedividedgame.com/country/ca/region/CA_ON",
      officials: [{ officeType: "provincialLegislature", officeLabel: "Member of the Provincial Legislature", characterId: null, characterName: "Test Member", party: "Independent", partyColor: "#666666", isNPP: true }],
    } });
    const command = interaction({ id: "CA_ON" });
    await state(command as unknown as ChatInputCommandInteraction);
    expect(getState).toHaveBeenCalledWith("CA_ON", null);
    expect(command.editReply.mock.calls[0][0].embeds[0].toJSON().fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Officials", value: expect.stringContaining("Member of the Provincial Legislature") }),
    ]));
  });
});
