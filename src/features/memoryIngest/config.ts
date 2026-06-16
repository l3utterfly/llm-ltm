import type { GraphNodeKind } from "../../demo/data";
import type { IngestConfig } from "./types";

export const DEFAULT_CONFIG: IngestConfig = {
  summarySystem:
    "You are a meticulous archivist of a character's inner life. Read each conversation and distil durable facts, feelings, relationships, and turning points. Ignore small talk and meta-chatter.",
  summaryInstruction:
    "Write 3-5 concise bullets capturing what matters most to this character. Prefer concrete specifics over generalities, and keep the character's own voice.",
  graphSystem:
    "You extract a knowledge graph from a character's memories. Identify entities - people, places, events, traits, objects - and the relationships connecting them.",
  graphInstruction: `Return JSON array in this format: [{"subject": "entity1", "relationship": "relation", "object": "entity2"}]. Keep labels short, merge duplicates, and only add a relation when the text supports it.`,
};

export const INGEST_PHASES = [
  "Reading",
  "Summarising",
  "Graphing",
  "Done",
] as const;

export const KIND_ICON: Record<GraphNodeKind, string> = {
  person: "●",
  place: "◆",
  event: "✦",
  trait: "❖",
  object: "■",
};

export const kindColorVar = (kind: GraphNodeKind) => `var(--k-${kind})`;
