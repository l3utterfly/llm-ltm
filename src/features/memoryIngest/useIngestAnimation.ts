import { useCallback, useEffect, useRef, useState } from "react";
import {
  LaylaAbortError,
  type LaylaCharacter,
  type LaylaSDK,
} from "@layla-network/sdk";
import type { DemoEntity, DemoLore } from "../../demo/data";
import { KIND_ICON } from "./config";
import { sleep } from "./layla";
import type {
  GraphEdge,
  IngestConfig,
  LogRow,
  Particle,
  PhaseIdx,
  PlacedNode,
} from "./types";

interface UseIngestAnimationArgs {
  character: LaylaCharacter;
  config: IngestConfig;
  layla: LaylaSDK;
  lore: DemoLore;
}

export function useIngestAnimation({
  character,
  config,
  layla,
  lore,
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

        const { sessions } = await layla.chat.getChatSessions(
          character.id,
          0,
          20,
          { signal },
        );
        const transcripts: string[] = [];

        if (sessions.length === 0) {
          pushRow({
            kind: "system",
            tick: "READ",
            text: "No previous sessions found",
          });
          setWeightedProgress(0, 1);
        }

        await sleep(280, signal);

        for (let i = 0; i < sessions.length; i += 1) {
          const history = await layla.chat.getChatHistory(
            sessions[i].session_id,
            0,
            50,
            { signal },
          );
          const text = history
            .slice()
            .reverse()
            .map((entry) => `${entry.name}: ${entry.content}`)
            .join("\n");

          transcripts.push(text);
          pushRow({
            kind: "system",
            tick: "READ",
            text: "Loaded session",
            bold: `#${i + 1} · ${history.length} messages`,
          });
          setWeightedProgress(0, (i + 1) / sessions.length);
          await sleep(260, signal);
        }

        setPhase(1);

        if (transcripts.length === 0) {
          setWeightedProgress(1, 1);
        }

        for (let i = 0; i < transcripts.length; i += 1) {
          const stream = layla.chat.completions.stream({
            messages: [
              { role: "system", content: config.summarySystem },
              {
                role: "user",
                content: `${transcripts[i]}\n\n${config.summaryInstruction}`,
              },
            ],
            signal,
          });

          pushRow({
            kind: "system",
            tick: "SUMMARISE",
            text: "Distilling session",
            bold: `#${i + 1}`,
          });

          await stream.finalContent();

          const memory = lore.memories[i % Math.max(1, lore.memories.length)];
          if (memory) {
            pushRow({ kind: "memory", tick: "MEMORY", text: memory });
          }

          setWeightedProgress(1, (i + 1) / transcripts.length);
          await sleep(160, signal);
        }

        for (let i = transcripts.length; i < lore.memories.length; i += 1) {
          pushRow({ kind: "memory", tick: "MEMORY", text: lore.memories[i] });
          await sleep(420, signal);
        }

        setPhase(2);

        await layla.chat.completions.create({
          messages: [
            { role: "system", content: config.graphSystem },
            {
              role: "user",
              content: `${lore.memories.join("\n")}\n\n${config.graphInstruction}\n[[task:graph]]`,
            },
          ],
          signal,
        });

        const placed = lore.entities.map((entity, index) =>
          placeNode(entity, index),
        );
        const nodesById = new Map(placed.map((node) => [node.id, node]));

        if (placed.length === 0) {
          setWeightedProgress(2, 1);
        }

        for (let i = 0; i < placed.length; i += 1) {
          const node = placed[i];

          setNodes((current) => [...current, node]);
          spawnParticles(node);
          pushRow({
            kind: "entity",
            tick: "ENTITY",
            text: `${KIND_ICON[node.kind]} ${node.kind}`,
            bold: node.label,
          });

          setEdges(() => {
            const present = new Set(placed.slice(0, i + 1).map((n) => n.id));

            return lore.relations
              .filter(
                (relation) =>
                  present.has(relation.from) && present.has(relation.to),
              )
              .map((relation) => ({
                from: nodesById.get(relation.from)!,
                to: nodesById.get(relation.to)!,
              }));
          });

          setWeightedProgress(2, (i + 1) / placed.length);
          await sleep(640, signal);
        }

        setPhase(3);
        setOverall(1);
        pushRow({
          kind: "system",
          tick: "COMMIT",
          text: "Knowledge graph written to memory",
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
    lore,
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
    stageRef,
  };
}
