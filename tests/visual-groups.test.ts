import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_VISUAL_GROUPS, parseVisualGroups, setVisualGroupsForTests } from "../app/lib/visual-groups.js";
import { pickCarouselFace, visualGroupMembers, visualPersonaIdFor } from "../app/lib/asset-selector.js";

describe("visual groups", () => {
  it("maps every account to its group's single master", () => {
    setVisualGroupsForTests(DEFAULT_VISUAL_GROUPS);
    assert.equal(visualPersonaIdFor("P06"), "P02");
    assert.equal(visualPersonaIdFor("P08"), "P14");
    assert.equal(visualPersonaIdFor("P04"), "P01");
    assert.deepEqual(visualGroupMembers("P11"), ["P02", "P06", "P11"]);
    const members = DEFAULT_VISUAL_GROUPS.flatMap((group) => group.members);
    assert.equal(new Set(members).size, 16);
  });

  it("reads the Sheet tab and rejects a persona listed in two groups", () => {
    const rows = [
      { group_id: "g1", label: "Brunes", master_persona_id: "P04", member_persona_ids: "P01, P04" },
      { group_id: "G2", label: "Blondes", master_persona_id: "P06", member_persona_ids: "P02 P11" },
    ];
    assert.deepEqual(parseVisualGroups(rows), [
      { id: "G1", label: "Brunes", master: "P04", members: ["P04", "P01"] },
      { id: "G2", label: "Blondes", master: "P06", members: ["P06", "P02", "P11"] },
    ]);
    assert.equal(parseVisualGroups([...rows, { group_id: "G3", master_persona_id: "P03", member_persona_ids: "P01" }]), null);
  });

  it("falls back to the master's face before a look-alike's", () => {
    setVisualGroupsForTests(DEFAULT_VISUAL_GROUPS);
    const image = (persona_id: string) => ({ source_type: "persona_generated", persona_id });
    const pool = [image("P06"), image("P02"), image("P02"), image("P02"), image("P11")];
    assert.equal(pickCarouselFace(pool, "P11", 3), "P02");
    assert.equal(pickCarouselFace([image("P11"), image("P11"), image("P11")], "P11", 3), "P11");
  });
});
