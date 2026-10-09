import { dataBackend } from "./data-backend";

// Look-alike personas form a visual group. Every new image of a group is
// generated from the same master; members keep their older images, which a
// carousel may show as long as it shows a single face.
export type VisualGroup = { id: string; label: string; master: string; members: string[] };

export const DEFAULT_VISUAL_GROUPS: VisualGroup[] = [
  { id: "G1", label: "Brunes claires", master: "P01", members: ["P01", "P04"] },
  { id: "G2", label: "Blondes", master: "P02", members: ["P02", "P06", "P11"] },
  { id: "G3", label: "Rousses", master: "P03", members: ["P03", "P07"] },
  { id: "G4", label: "Châtain ondulé", master: "P05", members: ["P05", "P16"] },
  { id: "G5", label: "Brunes olive", master: "P14", members: ["P14", "P08", "P15"] },
  { id: "G6", label: "Brunes ondulées", master: "P09", members: ["P09", "P12"] },
  { id: "G7", label: "Hana", master: "P10", members: ["P10"] },
  { id: "G8", label: "Jade", master: "P13", members: ["P13"] },
];

let groups: VisualGroup[] = DEFAULT_VISUAL_GROUPS;
let loadedAt = 0;

/** Rows of the Sheet tab 00_VISUAL_GROUPS (group_id, label, master_persona_id, member_persona_ids). */
export function parseVisualGroups(rows: Array<Record<string, unknown>>): VisualGroup[] | null {
  const parsed = rows.flatMap((row) => {
    const id = String(row.group_id ?? "").trim().toUpperCase();
    const master = String(row.master_persona_id ?? "").trim().toUpperCase();
    const members = String(row.member_persona_ids ?? "").toUpperCase().split(/[\s,;|]+/).filter((member) => /^P\d{2}$/.test(member));
    if (!/^G\d+$/.test(id) || !/^P\d{2}$/.test(master)) return [];
    return [{ id, label: String(row.label ?? id).trim() || id, master, members: [...new Set([master, ...members])] }];
  });
  const seen = new Set<string>();
  // A persona in two groups would make faces ambiguous: reject the whole tab.
  for (const group of parsed) for (const member of group.members) {
    if (seen.has(member)) return null;
    seen.add(member);
  }
  return parsed.length ? parsed : null;
}

/** Refreshes groups from the synced Sheet tab (at most every 5 minutes); keeps the defaults on any problem. */
export async function loadVisualGroups() {
  if (Date.now() - loadedAt < 5 * 60_000) return groups;
  loadedAt = Date.now();
  try {
    const response = await dataBackend("editorial_records?kind=eq.visual_groups&active=eq.true&select=data&limit=100");
    if (!response.ok) return groups;
    const rows = (await response.json() as Array<{ data?: Record<string, unknown> }>).map((row) => row.data ?? {});
    groups = parseVisualGroups(rows) ?? DEFAULT_VISUAL_GROUPS;
  } catch {
    // Defaults stay in place.
  }
  return groups;
}

export function visualGroups() { return groups; }
export function setVisualGroupsForTests(next: VisualGroup[]) { groups = next; loadedAt = Date.now(); }
export function visualGroupOf(personaId?: string | null) {
  if (!personaId) return undefined;
  return groups.find((group) => group.members.includes(personaId.toUpperCase()));
}
