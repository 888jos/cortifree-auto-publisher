import type { LayoutName, layoutSpecs } from "./data";

// Small presentational helpers shared by the Studio panels.

export function displayLabel(value: unknown, fallback = "uncategorized") {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).replaceAll("_", " ");
}

export function useReferenceFallback(event: React.SyntheticEvent<HTMLImageElement>, seed: string, category = "self care") {
  const image = event.currentTarget;
  if (image.dataset.fallback === "true") return;
  image.dataset.fallback = "true";
  image.src = `/api/assets/fallback?seed=${encodeURIComponent(seed)}&category=${encodeURIComponent(category)}`;
}

export function referenceCopy(title: string, role: string, position: number) {
  if (role === "HOOK") return { kicker: "A SOFTER RESET", headline: title, body: "realistic habits that fit into everyday life" };
  if (role === "CTA") return { kicker: "SAVE FOR LATER", headline: "Choose one habit to start with", body: "small changes are easier to keep" };
  const number = String(position - 1).padStart(2, "0");
  const content: Record<string, [string, string]> = {
    CHECKLIST: ["Make the next hour feel lighter", "Pick one simple action, not a perfect routine."],
    STEP: ["Build a calmer rhythm", "Keep this step realistic enough to repeat tomorrow."],
    FACT: ["Look at the whole routine", "Energy, sleep and stress can have more than one influence."],
    TAKEAWAY: ["Start with what feels manageable", "Consistency matters more than doing everything at once."],
    CONTEXT: ["Notice the pattern without judging it", "Use this as a prompt for reflection, not a diagnosis."],
    TIP: ["Try one low-effort shift", "Create a little more space in your day."],
  };
  const [headline, body] = content[role] ?? content.TIP!;
  return { kicker: `${number} · ${role}`, headline, body };
}

export function LayoutMockup({
  layout,
  reference,
  sample,
}: {
  layout: LayoutName;
  reference: { src: string; alt: string };
  sample: (typeof layoutSpecs)[LayoutName]["sample"];
}) {
  return (
    <div className={`layoutMockup ${layout}`} aria-hidden="true">
      {(layout === "grid-2x2" ? [0, 1, 2, 3] : [0]).map((index) => (
        <img
          alt={reference.alt}
          className="mockImage"
          key={index}
          loading="lazy"
          onError={(event) => useReferenceFallback(event, `${reference.alt}-${index}`)}
          src={reference.src}
        />
      ))}
      <div className="mockCopy">
        <small>{layout === "grid-2x2" ? "MOODBOARD · 02" : "EDITORIAL · 01"}</small>
        <strong>{sample.hook}</strong>
        <span>{sample.body}</span>
      </div>
    </div>
  );
}

export function ZoneList({ label, items }: { label: string; items: readonly string[] }) {
  return (
    <div className="zoneList">
      <b>{label}</b>
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}
