import type {
  LaylaCharacter,
  LaylaChatHistoryEntry,
  LaylaMemory,
  LaylaSDK,
} from "@layla-network/sdk";
import type { DemoEntity, DemoRelation, GraphNodeKind } from "../../demo/data";
import type { IngestConfig } from "./types";

const SESSION_PAGE_SIZE = 20;
const HISTORY_PAGE_SIZE = 50;
const WINDOW_SIZE = 3;

export interface SessionTranscript {
  sessionId: string;
  messages: LaylaChatHistoryEntry[];
}

export interface TranscriptWindow {
  rawText: string;
  timestamp: number;
}

export interface GraphTriple {
  subject: string;
  relationship: string;
  object: string;
}

export interface IngestedMemoryDraft extends LaylaMemory {
  graphTriples: GraphTriple[];
}

export interface GraphDisplayData {
  entities: DemoEntity[];
  relations: DemoRelation[];
}

interface LoadTranscriptArgs {
  characterId: string;
  cutoffTimestamp: number;
  layla: LaylaSDK;
  onHistory?: (sessionIndex: number, messageCount: number) => void;
  onProgress?: (complete: number, total: number) => void;
  signal: AbortSignal;
}

export async function getLatestMemoryTimestamp(
  layla: LaylaSDK,
  characterId: string,
  signal: AbortSignal,
): Promise<number> {
  const [latestMemory] = await layla.memories.list(characterId, 0, 1, {
    signal,
  });

  return latestMemory?.timestamp ?? 0;
}

export async function loadNewTranscripts({
  characterId,
  cutoffTimestamp,
  layla,
  onHistory,
  onProgress,
  signal,
}: LoadTranscriptArgs): Promise<SessionTranscript[]> {
  const transcripts: SessionTranscript[] = [];
  let sessionOffset = 0;
  let sessionIndex = 0;
  let shouldStopSessions = false;

  while (!shouldStopSessions) {
    const { sessions } = await layla.chat.getChatSessions(
      characterId,
      sessionOffset,
      SESSION_PAGE_SIZE,
      { signal },
    );
    const sortedSessions = [...sessions].sort(
      (a, b) => b.last_message_timestamp - a.last_message_timestamp,
    );

    if (sortedSessions.length === 0) break;

    for (const session of sortedSessions) {
      if (session.last_message_timestamp <= cutoffTimestamp) {
        shouldStopSessions = true;
        break;
      }

      const messages = await loadNewSessionMessages(
        layla,
        session.session_id,
        cutoffTimestamp,
        signal,
      );

      if (messages.length > 0) {
        transcripts.push({
          sessionId: session.session_id,
          messages: messages.sort((a, b) => a.timestamp - b.timestamp),
        });
      }

      sessionIndex += 1;
      onHistory?.(sessionIndex, messages.length);
      onProgress?.(sessionIndex, Math.max(sessionIndex, sortedSessions.length));
    }

    sessionOffset += sessions.length;
    if (sessions.length < SESSION_PAGE_SIZE) break;
  }

  return transcripts;
}

async function loadNewSessionMessages(
  layla: LaylaSDK,
  sessionId: string,
  cutoffTimestamp: number,
  signal: AbortSignal,
): Promise<LaylaChatHistoryEntry[]> {
  const messages: LaylaChatHistoryEntry[] = [];
  let historyOffset = 0;
  let shouldStopHistory = false;

  while (!shouldStopHistory) {
    const page = await layla.chat.getChatHistory(
      sessionId,
      historyOffset,
      HISTORY_PAGE_SIZE,
      { signal },
    );
    const sortedPage = [...page].sort((a, b) => b.timestamp - a.timestamp);

    if (sortedPage.length === 0) break;

    for (const entry of sortedPage) {
      if (entry.timestamp <= cutoffTimestamp) {
        shouldStopHistory = true;
        break;
      }

      if (entry.content?.trim()) {
        messages.push(entry);
      }
    }

    historyOffset += page.length;
    if (page.length < HISTORY_PAGE_SIZE) break;
  }

  return messages;
}

export function buildTranscriptWindows(
  transcripts: SessionTranscript[],
  character: LaylaCharacter,
): TranscriptWindow[] {
  return transcripts.flatMap((transcript) => {
    const { messages } = transcript;
    const windowCount = Math.max(0, messages.length - WINDOW_SIZE + 1);

    if (messages.length === 0) return [];
    if (windowCount === 0) {
      return [formatWindow(messages, character)];
    }

    return Array.from({ length: windowCount }, (_, index) =>
      formatWindow(messages.slice(index, index + WINDOW_SIZE), character),
    );
  });
}

export async function summarizeWindow(
  layla: LaylaSDK,
  config: IngestConfig,
  rawText: string,
  signal: AbortSignal,
): Promise<string> {
  const completion = await layla.chat.completions.create({
    messages: [
      { role: "system", content: config.summarySystem },
      {
        role: "user",
        content: `${rawText}\n\n${config.summaryInstruction}`,
      },
    ],
    signal,
  });

  return completion.choices[0]?.message.content.trim() ?? "";
}

export async function generateKnowledgeGraph(
  layla: LaylaSDK,
  config: IngestConfig,
  summary: string,
  signal: AbortSignal,
): Promise<{ display: GraphDisplayData; json: string; triples: GraphTriple[] }> {
  const completion = await layla.chat.completions.create({
    messages: [
      { role: "system", content: config.graphSystem },
      {
        role: "user",
        content: `${summary}\n\n${config.graphInstruction}\n[[task:graph]]`,
      },
    ],
    signal,
  });
  const content = completion.choices[0]?.message.content.trim() ?? "";
  const json = extractJsonString(content);
  const triples = parseGraphTriples(json);
  const display = parseGraphDisplay(json, triples);

  return { display, json, triples };
}

export function makeMemoryDraft(
  characterId: string,
  window: TranscriptWindow,
  summary: string,
  graphJson: string,
  graphTriples: GraphTriple[],
): IngestedMemoryDraft {
  return {
    id: 0,
    character_id: characterId,
    rawText: window.rawText,
    timestamp: window.timestamp,
    summary,
    knowledgeGraphJSON: graphJson,
    graphTriples,
  };
}

export function buildGraphDisplay(triples: GraphTriple[]): GraphDisplayData {
  const entitiesById = new Map<string, DemoEntity>();
  const relations: DemoRelation[] = [];

  for (const triple of triples) {
    const subject = cleanLabel(triple.subject);
    const object = cleanLabel(triple.object);
    const relationship = cleanLabel(triple.relationship);

    if (!subject || !object || !relationship) continue;

    const from = entityId(subject);
    const to = entityId(object);

    if (!entitiesById.has(from)) {
      entitiesById.set(from, {
        id: from,
        label: subject,
        kind: inferKind(subject),
      });
    }

    if (!entitiesById.has(to)) {
      entitiesById.set(to, {
        id: to,
        label: object,
        kind: inferKind(object),
      });
    }

    relations.push({
      from,
      to,
      label: relationship,
    });
  }

  return {
    entities: [...entitiesById.values()].slice(0, 28),
    relations: dedupeRelations(relations).slice(0, 40),
  };
}

function parseGraphDisplay(
  json: string,
  triples: GraphTriple[],
): GraphDisplayData {
  try {
    const parsed: unknown = JSON.parse(json);
    const fallback = buildGraphDisplay(triples);
    const parsedEntities = parseGraphEntities(parsed);
    const parsedRelations = parseGraphRelations(parsed, triples, parsedEntities);
    const relations =
      parsedRelations.length > 0 ? parsedRelations : fallback.relations;
    const entities = completeRelationEntities(
      parsedEntities.length > 0 ? parsedEntities : fallback.entities,
      relations,
    );

    return {
      entities: entities.slice(0, 28),
      relations: dedupeRelations(relations).slice(0, 40),
    };
  } catch {
    return buildGraphDisplay(triples);
  }
}

function parseGraphEntities(parsed: unknown): DemoEntity[] {
  if (!isObject(parsed)) return [];

  const nodeSource = Array.isArray(parsed.nodes)
    ? parsed.nodes
    : Array.isArray(parsed.entities)
      ? parsed.entities
      : [];

  return nodeSource.flatMap((item) => {
    if (typeof item === "string") {
      const label = cleanLabel(item);
      return label ? [{ id: entityId(label), label, kind: inferKind(label) }] : [];
    }
    if (!isObject(item)) return [];

    const label =
      stringField(item, "label") ||
      stringField(item, "name") ||
      stringField(item, "id");
    if (!label) return [];

    const id = entityId(stringField(item, "id") || label);
    const kind = graphNodeKind(stringField(item, "kind") || stringField(item, "type"), label);

    return [{ id, label: cleanLabel(label), kind }];
  });
}

function parseGraphRelations(
  parsed: unknown,
  triples: GraphTriple[],
  entities: DemoEntity[],
): DemoRelation[] {
  const entitiesByRawId = new Map<string, string>();

  for (const entity of entities) {
    entitiesByRawId.set(entity.id, entity.id);
    entitiesByRawId.set(entity.label.toLowerCase(), entity.id);
  }

  if (!isObject(parsed)) return buildGraphDisplay(triples).relations;

  const relationSource = Array.isArray(parsed.edges)
    ? parsed.edges
    : Array.isArray(parsed.relations)
      ? parsed.relations
      : [];

  const relations = relationSource.flatMap((item) => {
    if (!isObject(item)) return [];

    const from =
      stringField(item, "from") ||
      stringField(item, "source") ||
      stringField(item, "subject");
    const to =
      stringField(item, "to") ||
      stringField(item, "target") ||
      stringField(item, "object");
    const label =
      stringField(item, "label") ||
      stringField(item, "relationship") ||
      stringField(item, "relation");

    if (!from || !to || !label) return [];

    return [
      {
        from: normalizeEntityRef(from, entitiesByRawId),
        to: normalizeEntityRef(to, entitiesByRawId),
        label: cleanLabel(label),
      },
    ];
  });

  return relations.length > 0 ? relations : buildGraphDisplay(triples).relations;
}

function formatWindow(
  entries: LaylaChatHistoryEntry[],
  character: LaylaCharacter,
): TranscriptWindow {
  const characterName = character.data.data.name;
  const rawText = entries
    .map((entry) => `${speakerName(entry, characterName)}: ${entry.content}`)
    .join("\n");
  const timestamp = Math.max(...entries.map((entry) => entry.timestamp));

  return { rawText, timestamp };
}

function speakerName(
  entry: LaylaChatHistoryEntry,
  characterName: string,
): string {
  if (entry.role === "assistant") return characterName;
  if (entry.role === "user") return "user";

  return entry.name || entry.role;
}

function extractJsonString(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;

  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    const arrayStart = candidate.indexOf("[");
    const arrayEnd = candidate.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      const slice = candidate.slice(arrayStart, arrayEnd + 1);
      try {
        JSON.parse(slice);
        return slice;
      } catch {
        return JSON.stringify({ raw: content });
      }
    }

    return JSON.stringify({ raw: content });
  }
}

function parseGraphTriples(json: string): GraphTriple[] {
  try {
    const parsed: unknown = JSON.parse(json);
    const relationSource = Array.isArray(parsed)
      ? parsed
      : isObject(parsed) && Array.isArray(parsed.relations)
        ? parsed.relations
        : [];

    return relationSource.flatMap((item) => {
      if (!isObject(item)) return [];

      const subject =
        stringField(item, "subject") ||
        stringField(item, "from") ||
        stringField(item, "source");
      const relationship =
        stringField(item, "relationship") ||
        stringField(item, "relation") ||
        stringField(item, "label");
      const object =
        stringField(item, "object") ||
        stringField(item, "to") ||
        stringField(item, "target");

      if (!subject || !relationship || !object) return [];

      return [{ subject, relationship, object }];
    });
  } catch {
    return [];
  }
}

function cleanLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function entityId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function inferKind(label: string): GraphNodeKind {
  const lower = label.toLowerCase();

  if (/\b(city|station|home|room|market|school|port|library|garden)\b/.test(lower)) {
    return "place";
  }
  if (/\b(fear|trust|guilt|love|anger|habit|belief|trait)\b/.test(lower)) {
    return "trait";
  }
  if (/\b(day|night|meeting|promise|loss|memory|event|fight)\b/.test(lower)) {
    return "event";
  }
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/.test(label)) {
    return "person";
  }

  return "object";
}

function graphNodeKind(value: string, label: string): GraphNodeKind {
  const normalized = value.toLowerCase();

  if (
    normalized === "person" ||
    normalized === "place" ||
    normalized === "event" ||
    normalized === "trait" ||
    normalized === "object"
  ) {
    return normalized;
  }

  return inferKind(label);
}

function normalizeEntityRef(
  value: string,
  entitiesByRawId: Map<string, string>,
): string {
  const cleaned = cleanLabel(value);

  return (
    entitiesByRawId.get(cleaned) ??
    entitiesByRawId.get(cleaned.toLowerCase()) ??
    entityId(cleaned)
  );
}

function completeRelationEntities(
  entities: DemoEntity[],
  relations: DemoRelation[],
): DemoEntity[] {
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));

  for (const relation of relations) {
    for (const id of [relation.from, relation.to]) {
      if (entitiesById.has(id)) continue;

      const label = labelFromEntityId(id);
      entitiesById.set(id, {
        id,
        label,
        kind: inferKind(label),
      });
    }
  }

  return [...entitiesById.values()];
}

function labelFromEntityId(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dedupeRelations(relations: DemoRelation[]): DemoRelation[] {
  const seen = new Set<string>();

  return relations.filter((relation) => {
    const key = `${relation.from}|${relation.label}|${relation.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  return typeof field === "string" ? field.trim() : "";
}
