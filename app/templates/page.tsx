"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import "./templates.css";

type Slide = { role: string; image: string; copy: string; layout: string };
type Template = {
  id: string;
  name: string;
  family: string;
  difficulty: "Easy" | "Medium" | "Hard";
  ai: string;
  slides: number;
  font: string;
  palette: string;
  rule: string;
  slidesSpec: Slide[];
};

const templates: Template[] = [
  {
    id: "glow-up-habits",
    name: "Glow-up habits",
    family: "List / saveable",
    difficulty: "Easy",
    ai: "0–1 image",
    slides: 6,
    font: "TikTok Sans Bold",
    palette: "Butter yellow · white",
    rule: "Une personne maximum par image. Hook humain, image liée à l’action.",
    slidesSpec: [
      { role: "HOOK", image: "portrait/action, sujet à droite", copy: "5 tiny habits that make you feel more put together", layout: "Texte haut gauche, 1–2 mots par ligne" },
      { role: "01", image: "routine miroir / soin", copy: "Start with one reset", layout: "Numéro petit + conseil court en bas gauche" },
      { role: "02", image: "tenue réelle préparée", copy: "Plan tomorrow's outfit", layout: "Texte dans l’espace vide, jamais sur le visage" },
      { role: "03", image: "marche / extérieur", copy: "Get outside for ten minutes", layout: "Bloc texte latéral" },
      { role: "04", image: "bureau / téléphone posé", copy: "Make your next step obvious", layout: "Titre court centré dans zone calme" },
      { role: "CTA", image: "portrait souriant naturel", copy: "Save this for your next reset", layout: "CTA bas, très court" },
    ],
  },
  {
    id: "lower-cortisol",
    name: "Lower cortisol checklist",
    family: "Educational checklist",
    difficulty: "Easy",
    ai: "0–1 image",
    slides: 7,
    font: "Archivo SemiBold",
    palette: "Light blue · white",
    rule: "Pas de promesse médicale. Wording prudent : peut aider, soutenir, essayer.",
    slidesSpec: [
      { role: "HOOK", image: "personne calme dans une pièce lumineuse", copy: "5 low-key ways to feel more together", layout: "Hook à droite du sujet" },
      { role: "01", image: "verre d’eau / matin", copy: "Slow down your first ten minutes", layout: "Carte blanche en bas" },
      { role: "02", image: "marche extérieure", copy: "Take a short daylight walk", layout: "Texte sur zone ciel / mur" },
      { role: "03", image: "tenue simple préparée", copy: "Remove one decision from tomorrow", layout: "Texte à gauche, sujet à droite" },
      { role: "04", image: "chambre calme", copy: "Make your room easier to rest in", layout: "Texte bas gauche" },
      { role: "05", image: "journal / téléphone", copy: "Write down the next small step", layout: "Texte dans espace vide" },
      { role: "CTA", image: "détail lifestyle cohérent", copy: "Save the gentle version", layout: "CTA seul, bas centre" },
    ],
  },
  {
    id: "morning-routine",
    name: "Morning routine",
    family: "Routine timeline",
    difficulty: "Easy",
    ai: "0–2 images",
    slides: 7,
    font: "Manrope Bold",
    palette: "Soft pink · white",
    rule: "Même persona, même lumière, gestes simples et crédibles.",
    slidesSpec: [
      { role: "HOOK", image: "personne dans une cuisine / chambre", copy: "My realistic morning reset", layout: "Titre vertical à gauche" },
      { role: "STEP 01", image: "réveil / fenêtre", copy: "Open the curtains", layout: "Heure + action en bas" },
      { role: "STEP 02", image: "eau / boisson", copy: "Drink something before scrolling", layout: "Action dans zone claire" },
      { role: "STEP 03", image: "skincare simple", copy: "Keep the first step easy", layout: "Numéro rond + phrase" },
      { role: "STEP 04", image: "tenue / miroir", copy: "Get dressed before overthinking", layout: "Texte hors visage" },
      { role: "STEP 05", image: "sortie / marche", copy: "Get a little daylight", layout: "Texte bas gauche" },
      { role: "CTA", image: "portrait naturel", copy: "A routine you can repeat", layout: "CTA court" },
    ],
  },
  {
    id: "ten-day-challenge",
    name: "10-day glow-up challenge",
    family: "Challenge cards",
    difficulty: "Easy",
    ai: "0–3 images",
    slides: 11,
    font: "Plus Jakarta Sans Bold",
    palette: "Light pink · butter yellow",
    rule: "Une seule couleur d’accent par slide. Pas de structure à trois blocs.",
    slidesSpec: [
      { role: "HOOK", image: "portrait / action claire", copy: "10 days to feel more like yourself", layout: "Hook grand, 2–4 lignes" },
      { role: "DAY 01", image: "eau / matin", copy: "Start with water", layout: "Day en petit, action grande" },
      { role: "DAY 02", image: "tenue", copy: "Wear the outfit", layout: "Une phrase, zone vide" },
      { role: "DAY 03", image: "marche", copy: "Take the long way", layout: "Texte sur fond clair" },
      { role: "DAY 04", image: "soin", copy: "Do one caring thing", layout: "Texte bas" },
      { role: "DAY 05", image: "bureau", copy: "Clear one surface", layout: "Sujet opposé au texte" },
      { role: "DAY 06", image: "repas simple", copy: "Make it easy to eat well", layout: "Texte hors aliment" },
      { role: "DAY 07", image: "téléphone posé", copy: "Leave one thing unanswered", layout: "Texte haut" },
      { role: "DAY 08", image: "chambre", copy: "Create a softer evening", layout: "Texte dans espace sombre" },
      { role: "DAY 09", image: "miroir", copy: "Notice what is working", layout: "Texte latéral" },
      { role: "DAY 10", image: "portrait final", copy: "Keep the parts that feel like you", layout: "CTA final" },
    ],
  },
  {
    id: "symptom-checklist",
    name: "Symptom / reframe checklist",
    family: "Hormone education",
    difficulty: "Medium",
    ai: "0–1 image",
    slides: 7,
    font: "Archivo Bold",
    palette: "White · light blue",
    rule: "Chaque slide = un seul symptôme et un seul reframe. Pas de diagnostic.",
    slidesSpec: [
      { role: "HOOK", image: "visage naturel, expression réfléchie", copy: "If you feel off lately, start here", layout: "Texte haut droit" },
      { role: "01", image: "détail fatigue / repos", copy: "Low energy does not mean lazy", layout: "Titre + reframe" },
      { role: "02", image: "repas / cuisine", copy: "Cravings are information, not failure", layout: "Texte sur mur / fond" },
      { role: "03", image: "marche / extérieur", copy: "A small walk still counts", layout: "Phrase unique" },
      { role: "04", image: "journal", copy: "Track patterns before judging yourself", layout: "Bloc blanc bas" },
      { role: "05", image: "chambre / sommeil", copy: "Rest is part of the plan", layout: "Texte en haut" },
      { role: "CTA", image: "portrait calme", copy: "Save this gentle reminder", layout: "CTA seul" },
    ],
  },
  {
    id: "things-i-stopped",
    name: "Things I stopped doing",
    family: "POV / relatable",
    difficulty: "Easy",
    ai: "0 image",
    slides: 6,
    font: "Space Grotesk Bold",
    palette: "White · pale yellow",
    rule: "Format texte-first : une image seulement si elle sert vraiment la phrase.",
    slidesSpec: [
      { role: "HOOK", image: "portrait ou fond texturé", copy: "Things I stopped doing to feel less scattered", layout: "Texte grand, zone supérieure" },
      { role: "01", image: "faceless téléphone", copy: "Checking my phone before getting up", layout: "Phrase sur 2 lignes max" },
      { role: "02", image: "faceless bureau", copy: "Making a full day out of one bad hour", layout: "Texte central" },
      { role: "03", image: "faceless tenue", copy: "Waiting to feel ready", layout: "Accent sur un seul mot" },
      { role: "04", image: "faceless chambre", copy: "Calling rest unproductive", layout: "Texte bas gauche" },
      { role: "CTA", image: "aucune ou détail", copy: "Which one are you leaving behind?", layout: "Question finale" },
    ],
  },
  {
    id: "pov-relatable",
    name: "POV / relatable moment",
    family: "Editorial POV",
    difficulty: "Medium",
    ai: "0–1 image",
    slides: 5,
    font: "Bricolage Grotesque Bold",
    palette: "Light pink · white",
    rule: "Une image humaine au hook, pas un paysage. Copie courte et très conversationnelle.",
    slidesSpec: [
      { role: "HOOK", image: "personne dans une situation précise", copy: "POV: you finally stop making everything urgent", layout: "Texte vertical à droite" },
      { role: "02", image: "mains / téléphone", copy: "You answer later", layout: "Texte haut gauche" },
      { role: "03", image: "personne qui marche", copy: "You take the slower option", layout: "Texte dans espace vide" },
      { role: "04", image: "chambre / soirée", copy: "You let the day end", layout: "Texte bas" },
      { role: "CTA", image: "portrait naturel", copy: "That is the glow-up", layout: "Phrase finale courte" },
    ],
  },
  {
    id: "story-transformation",
    name: "Realistic transformation story",
    family: "Story / progression",
    difficulty: "Hard",
    ai: "1–3 images",
    slides: 6,
    font: "Instrument Sans Bold",
    palette: "Soft blue · white",
    rule: "Pas de faux avant/après corporel. Transformation comportementale uniquement.",
    slidesSpec: [
      { role: "HOOK", image: "portrait avant, expression naturelle", copy: "The reset was smaller than I expected", layout: "Texte dans zone vide" },
      { role: "BEFORE", image: "même persona, scène chargée", copy: "I kept trying to fix everything at once", layout: "Texte bas" },
      { role: "SHIFT", image: "action simple", copy: "Then I picked one repeatable thing", layout: "Texte à côté du sujet" },
      { role: "AFTER", image: "même persona, scène calme", copy: "The goal became easier to return to", layout: "Texte haut" },
      { role: "PROOF", image: "détail routine", copy: "Small is what made it stick", layout: "Phrase unique" },
      { role: "CTA", image: "portrait final", copy: "Save this for your next reset", layout: "CTA bas" },
    ],
  },
];

export default function TemplatesPage() {
  const [selectedId, setSelectedId] = useState(templates[0].id);
  const selected = useMemo(() => templates.find((template) => template.id === selectedId) ?? templates[0], [selectedId]);

  return (
    <main className="templateLab">
      <header className="templateLabHeader">
        <div>
          <Link className="backLink" href="/">← Retour au studio</Link>
          <p className="eyebrow">CORTIFREE · TEMPLATE LAB</p>
          <h1>Structures exactes pour les carrousels</h1>
          <p className="templateLead">Blueprints inspirés de la collection TikTok : chaque slide a un rôle, une image attendue et une zone de texte déterminée.</p>
        </div>
        <div className="templateHeaderStats"><span><b>{templates.length}</b> familles prêtes</span><span><b>5</b> formats faciles</span><span><b>1</b> personne max dans un faceswap</span></div>
      </header>

      <section className="templateGrid" aria-label="Familles de templates">
        {templates.map((template) => (
          <button className={`templateCard ${selected.id === template.id ? "selected" : ""}`} key={template.id} onClick={() => setSelectedId(template.id)} type="button">
            <div className="templateCardTop"><span className={`difficulty difficulty-${template.difficulty.toLowerCase()}`}>{template.difficulty}</span><span>{template.slides} slides</span></div>
            <h2>{template.name}</h2>
            <p>{template.family}</p>
            <small>{template.ai} · {template.font}</small>
          </button>
        ))}
      </section>

      <section className="templateDetail">
        <div className="detailHead">
          <div><p className="eyebrow">BLUEPRINT · {selected.id}</p><h2>{selected.name}</h2><p>{selected.rule}</p></div>
          <div className="detailChips"><span>{selected.palette}</span><span>{selected.font}</span><span>IA : {selected.ai}</span></div>
        </div>
        <div className="exactStructure">
          <div className="structureHeader"><span>Slide</span><span>Image à sélectionner / générer</span><span>Texte exact de départ</span><span>Composition</span></div>
          {selected.slidesSpec.map((slide, index) => (
            <article className="structureRow" key={`${selected.id}-${slide.role}`}>
              <div className="slideNumber"><b>{String(index + 1).padStart(2, "0")}</b><span>{slide.role}</span></div>
              <div><strong>{slide.image}</strong><small>Face visible : {slide.role === "HOOK" || slide.role === "CTA" ? "oui, une seule personne" : "optionnelle"}</small></div>
              <div className="copyCell">{slide.copy}</div>
              <div><span className="layoutTag">{slide.layout}</span></div>
            </article>
          ))}
        </div>
        <div className="productionRules"><div><b>Règle image</b><span>Asset existant prioritaire. ModelArk seulement si la scène manque.</span></div><div><b>Règle hook</b><span>Un humain ou une action humaine au hook, jamais un paysage seul.</span></div><div><b>Règle texte</b><span>Une seule couleur d’accent par slide, maximum deux couleurs au total.</span></div><div><b>Règle qualité</b><span>Pas de watermark, pas de doublon, pas de visages déformés, pas de texte illisible.</span></div></div>
      </section>
    </main>
  );
}
