import { useCallback, useEffect, useRef, useState } from "react";
import {
  LaylaAbortError,
  type LaylaCharacter,
  type LaylaMemory,
  type LaylaSDK,
} from "@layla-network/sdk";
import type { DemoEntity, DemoRelation } from "../../demo/data";
import { KIND_ICON } from "./config";
import {
  buildTranscriptWindows,
  generateKnowledgeGraph,
  getLatestMemoryTimestamp,
  type IngestedMemoryDraft,
  loadNewTranscripts,
  makeMemoryDraft,
  summarizeWindow,
} from "./ingestion";
import { sleep } from "./layla";
import type {
  GraphEdge,
  IngestConfig,
  IngestStats,
  LogRow,
  Particle,
  PhaseIdx,
  PlacedNode,
} from "./types";

interface UseIngestAnimationArgs {
  character: LaylaCharacter;
  config: IngestConfig;
  layla: LaylaSDK;
}

function memoryPayload(memory: IngestedMemoryDraft): LaylaMemory {
  return {
    id: memory.id,
    character_id: memory.character_id,
    rawText: memory.rawText,
    timestamp: memory.timestamp,
    summary: memory.summary,
    knowledgeGraphJSON: memory.knowledgeGraphJSON,
    session_id: memory.session_id,
  };
}

export function useIngestAnimation({
  character,
  config,
  layla,
}: UseIngestAnimationArgs) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dimsRef = useRef({ w: 320, h: 360 });
  const abortRef = useRef<AbortController | null>(null);
  const rowId = useRef(0);
  const particleId = useRef(0);
  const runRef = useRef(false);

  const [phase, setPhase] = useState<PhaseIdx>(0);
  const [phaseProg, setPhaseProg] = useState(0);
  const [overall, setOverall] = useState(0);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [nodes, setNodes] = useState<PlacedNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [stats, setStats] = useState<IngestStats>({
    entities: 0,
    memories: 0,
    relations: 0,
  });
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const readDims = () => {
      const next = { w: stage.clientWidth, h: stage.clientHeight };
      dimsRef.current = next;
    };
    const observer = new ResizeObserver(readDims);

    observer.observe(stage);
    readDims();

    return () => observer.disconnect();
  }, []);

  const pushRow = useCallback((row: Omit<LogRow, "id">) => {
    setRows((current) => {
      const next = [...current, { ...row, id: rowId.current++ }];
      return next.slice(-40);
    });
  }, []);

  const setWeightedProgress = useCallback((phaseIndex: PhaseIdx, within: number) => {
    setPhaseProg(within);

    const base = phaseIndex === 0 ? 0 : phaseIndex === 1 ? 0.12 : 0.58;
    const span = phaseIndex === 0 ? 0.12 : phaseIndex === 1 ? 0.46 : 0.42;

    setOverall(Math.min(1, base + span * within));
  }, []);

  const placeNode = useCallback(
    (entity: DemoEntity, index: number): PlacedNode => {
      const { w, h } = dimsRef.current;
      const cx = w / 2;
      const cy = h / 2;
      const ring = index % 2 === 0 ? 0 : 1;
      const radius = ring === 0 ? Math.min(w, h) * 0.3 : Math.min(w, h) * 0.42;
      const angle = index * 2.399963 + (ring === 1 ? 0.6 : 0);
      const jitter = ((index * 53) % 17) / 17 - 0.5;
      const r = radius + jitter * 18;
      const x = cx + Math.cos(angle) * r * 1.18;
      const y = cy + Math.sin(angle) * r;
      const pad = 60;

      return {
        ...entity,
        x: Math.max(pad, Math.min(w - pad, x)),
        y: Math.max(40, Math.min(h - 30, y)),
      };
    },
    [],
  );

  const spawnParticles = useCallback((target: PlacedNode) => {
    const { w, h } = dimsRef.current;
    const created: Particle[] = [];

    for (let i = 0; i < 3; i += 1) {
      const edge = Math.floor(Math.random() * 4);
      const start =
        edge === 0
          ? { x: Math.random() * w, y: -20 }
          : edge === 1
            ? { x: w + 20, y: Math.random() * h }
            : edge === 2
              ? { x: Math.random() * w, y: h + 20 }
              : { x: -20, y: Math.random() * h };

      created.push({
        id: particleId.current++,
        x0: start.x - target.x,
        y0: start.y - target.y,
        x: target.x,
        y: target.y,
        dur: 1.6 + Math.random() * 1.4,
      });
    }

    setParticles((current) => [...current, ...created]);

    const ids = new Set(created.map((particle) => particle.id));
    window.setTimeout(() => {
      setParticles((current) =>
        current.filter((particle) => !ids.has(particle.id)),
      );
    }, 3200);
  }, []);

  useEffect(() => {
    if (runRef.current) return;

    runRef.current = true;

    const abortController = new AbortController();
    abortRef.current = abortController;
    const { signal } = abortController;

    async function ingestMemories() {
      try {
        setPhase(0);
        pushRow({
          kind: "system",
          tick: "CONNECT",
          text: `Opening memory store for ${character.data.data.name}`,
        });

        const cutoffTimestamp = await getLatestMemoryTimestamp(
          layla,
          character.id,
          signal,
        );

        pushRow({
          kind: "system",
          tick: "MEMORY",
          text: cutoffTimestamp
            ? "Latest saved memory cutoff found"
            : "No saved memories found; scanning all chats",
          bold: cutoffTimestamp ? new Date(cutoffTimestamp).toLocaleString() : "",
        });

        const transcripts = await loadNewTranscripts({
          characterId: character.id,
          cutoffTimestamp,
          layla,
          onHistory: (index, messageCount) => {
            pushRow({
              kind: "system",
              tick: "READ",
              text: "Loaded session",
              bold: `#${index} · ${messageCount} new messages`,
            });
          },
          onProgress: (complete, total) => {
            setWeightedProgress(0, total === 0 ? 1 : complete / total);
          },
          signal,
        });

        const windows = buildTranscriptWindows(transcripts, character);

        if (windows.length === 0) {
          pushRow({
            kind: "system",
            tick: "SKIP",
            text: "No new chat messages found after the latest memory",
          });
          setWeightedProgress(0, 1);
          setWeightedProgress(1, 1);
          setWeightedProgress(2, 1);
          setPhase(3);
          setOverall(1);
          setFinished(true);
          return;
        }

        setWeightedProgress(0, 1);
        await sleep(180, signal);
        setPhase(1);

        const memoryDrafts: IngestedMemoryDraft[] = [];

        for (let i = 0; i < windows.length; i += 1) {
          pushRow({
            kind: "system",
            tick: "SUMMARISE",
            text: "Distilling message window",
            bold: `#${i + 1}`,
          });

          const summary = await summarizeWindow(
            layla,
            config,
            windows[i].rawText,
            signal,
          );

          const draft = makeMemoryDraft(
            character.id,
            windows[i].sessionId,
            windows[i],
            summary,
            null,
            [],
          );
          const [savedMemory] = await layla.memories.createOrUpdate(
            [memoryPayload(draft)],
            { signal },
          );

          if (!savedMemory) {
            throw new Error("Layla did not return the saved memory.");
          }

          memoryDrafts.push({
            ...draft,
            ...savedMemory,
            graphTriples: [],
          });
          setStats((current) => ({
            ...current,
            memories: memoryDrafts.length,
          }));

          if (summary) {
            pushRow({
              kind: "memory",
              tick: "MEMORY",
              text: summary,
            });
          }
          pushRow({
            kind: "system",
            tick: "SAVE",
            text: "Summary saved to memory",
            bold: `#${i + 1}`,
          });

          setWeightedProgress(1, (i + 1) / windows.length);
          await sleep(160, signal);
        }

        setPhase(2);

        const entitiesById = new Map<string, DemoEntity>();
        const relationsByKey = new Map<string, DemoRelation>();
        const placedById = new Map<string, PlacedNode>();
        const graphProgress = (graphIndex: number, withinGraph: number) =>
          (graphIndex + withinGraph) / Math.max(1, memoryDrafts.length);

        const revealGraph = async (
          graphEntities: DemoEntity[],
          graphRelations: DemoRelation[],
          graphIndex: number,
        ) => {
          const newPlaced: PlacedNode[] = [];

          for (const entity of graphEntities) {
            if (entitiesById.has(entity.id)) continue;

            entitiesById.set(entity.id, entity);

            const placed = placeNode(entity, entitiesById.size - 1);
            placedById.set(entity.id, placed);
            newPlaced.push(placed);
          }

          for (const relation of graphRelations) {
            const key = `${relation.from}|${relation.label}|${relation.to}`;
            if (!relationsByKey.has(key)) {
              relationsByKey.set(key, relation);
            }
          }

          const updateEdges = () => {
            setEdges(
              [...relationsByKey.values()]
                .filter(
                  (relation) =>
                    placedById.has(relation.from) && placedById.has(relation.to),
                )
                .map((relation) => ({
                  from: placedById.get(relation.from)!,
                  to: placedById.get(relation.to)!,
                })),
            );
          };

          if (newPlaced.length === 0) {
            updateEdges();
            setWeightedProgress(2, graphProgress(graphIndex, 0.86));
            return;
          }

          for (let i = 0; i < newPlaced.length; i += 1) {
            const node = newPlaced[i];

            setNodes((current) => [...current, node]);
            spawnParticles(node);
            pushRow({
              kind: "entity",
              tick: "ENTITY",
              text: `${KIND_ICON[node.kind]} ${node.kind}`,
              bold: node.label,
            });

            updateEdges();
            setWeightedProgress(
              2,
              graphProgress(
                graphIndex,
                0.62 + ((i + 1) / newPlaced.length) * 0.24,
              ),
            );
            await sleep(520, signal);
          }
        };

        for (let i = 0; i < memoryDrafts.length; i += 1) {
          pushRow({
            kind: "system",
            tick: "GRAPH",
            text: "Extracting knowledge graph",
            bold: `#${i + 1}`,
          });

          const graph = await generateKnowledgeGraph(
            layla,
            config,
            memoryDrafts[i].summary ?? "",
            signal,
          );

          const graphedMemory = {
            ...memoryDrafts[i],
            knowledgeGraphJSON: graph.json,
            graphTriples: graph.triples,
          };
          const [savedMemory] = await layla.memories.createOrUpdate(
            [memoryPayload(graphedMemory)],
            { signal },
          );

          if (!savedMemory) {
            throw new Error("Layla did not return the updated memory.");
          }

          memoryDrafts[i] = {
            ...graphedMemory,
            ...savedMemory,
            graphTriples: graph.triples,
          };
          setWeightedProgress(
            2,
            graphProgress(i, 0.62),
          );
          pushRow({
            kind: "system",
            tick: "SAVE",
            text: "Knowledge graph saved to memory",
            bold: `#${i + 1}`,
          });
          await revealGraph(graph.display.entities, graph.display.relations, i);
          setStats({
            entities: entitiesById.size,
            memories: memoryDrafts.length,
            relations: relationsByKey.size,
          });
        }

        setStats({
          entities: entitiesById.size,
          memories: memoryDrafts.length,
          relations: relationsByKey.size,
        });
        setWeightedProgress(2, 1);
        setPhase(3);
        setOverall(1);
        pushRow({
          kind: "system",
          tick: "COMMIT",
          text: "Knowledge graph written to memory",
          bold: `${memoryDrafts.length} saved`,
        });
        await sleep(500, signal);
        setFinished(true);
      } catch (error) {
        if (error instanceof LaylaAbortError) return;

        pushRow({
          kind: "system",
          tick: "ERROR",
          text: (error as Error).message,
        });
      }
    }

    void ingestMemories();

    return () => {
      runRef.current = false;
      abortController.abort();
    };
  }, [
    character,
    config,
    layla,
    placeNode,
    pushRow,
    setWeightedProgress,
    spawnParticles,
  ]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    abort,
    edges,
    finished,
    nodes,
    overall,
    particles,
    phase,
    phaseProg,
    rows,
    stats,
    stageRef,
  };
}
