import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LaylaSDK,
  LaylaAbortError,
  type LaylaCharacter,
} from "@layla-network/sdk";
import { LORE, type DemoEntity, type GraphNodeKind } from "./demo/data";

/* ------------------------------------------------------------------ */
/* Config: four inputs across two tasks                                */
/* ------------------------------------------------------------------ */
interface IngestConfig {
  summarySystem: string;
  summaryInstruction: string;
  graphSystem: string;
  graphInstruction: string;
}

const DEFAULT_CONFIG: IngestConfig = {
  summarySystem:
    "You are a meticulous archivist of a character\u2019s inner life. Read each conversation and distil durable facts, feelings, relationships, and turning points. Ignore small talk and meta-chatter.",
  summaryInstruction:
    "Write 3\u20135 concise bullets capturing what matters most to this character. Prefer concrete specifics over generalities, and keep the character\u2019s own voice.",
  graphSystem:
    "You extract a knowledge graph from a character\u2019s memories. Identify entities \u2014 people, places, events, traits, objects \u2014 and the relationships connecting them.",
  graphInstruction: `Return JSON array in this format: [{"subject": "entity1", "relationship": "relation", "object": "entity2"}]. Keep labels short, merge duplicates, and only add a relation when the text supports it.`,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
type Screen = "pick" | "detail" | "ingest";

const KIND_ICON: Record<GraphNodeKind, string> = {
  person: "\u25CF",
  place: "\u25C6",
  event: "\u2726",
  trait: "\u2756",
  object: "\u25A0",
};

/** Prefer an embedded portrait (a real Layla pattern), else ask the host. */
async function resolvePortrait(
  layla: LaylaSDK,
  c: LaylaCharacter,
): Promise<string> {
  const embedded = c.data.data.extensions?.image;
  if (typeof embedded === "string" && embedded.length > 0) return embedded;
  try {
    const src = await layla.characters.getImage(c.id);
    if (src) return src;
  } catch {
    /* fall through */
  }
  return "";
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new LaylaAbortError("aborted"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new LaylaAbortError("aborted"));
      },
      { once: true },
    );
  });

/* ================================================================== */
/* App                                                                 */
/* ================================================================== */
export default function App() {
  const layla = useMemo(() => new LaylaSDK(), []);
  const [screen, setScreen] = useState<Screen>("pick");
  const [characters, setCharacters] = useState<LaylaCharacter[]>([]);
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<LaylaCharacter | null>(null);
  const [config, setConfig] = useState<IngestConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await layla.characters.list(0, 12);
      if (!alive) return;
      setCharacters(list);
      const pairs = await Promise.all(
        list.map(async (c) => [c.id, await resolvePortrait(layla, c)] as const),
      );
      if (!alive) return;
      setPortraits(Object.fromEntries(pairs));
    })();
    return () => {
      alive = false;
    };
  }, [layla]);

  const openDetail = (c: LaylaCharacter) => {
    setSelected(c);
    setConfig(DEFAULT_CONFIG);
    setScreen("detail");
  };

  return (
    <div className="app">
      {screen === "pick" && (
        <Picker
          characters={characters}
          portraits={portraits}
          onPick={openDetail}
        />
      )}
      {screen === "detail" && selected && (
        <Detail
          character={selected}
          portrait={portraits[selected.id] ?? ""}
          config={config}
          setConfig={setConfig}
          onBack={() => setScreen("pick")}
          onStart={() => setScreen("ingest")}
        />
      )}
      {screen === "ingest" && selected && (
        <Ingest
          layla={layla}
          character={selected}
          portrait={portraits[selected.id] ?? ""}
          config={config}
          onExit={() => setScreen("detail")}
          onDone={() => setScreen("pick")}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/* Screen 1 — Picker                                                   */
/* ================================================================== */
function Picker({
  characters,
  portraits,
  onPick,
}: {
  characters: LaylaCharacter[];
  portraits: Record<string, string>;
  onPick: (c: LaylaCharacter) => void;
}) {
  return (
    <>
      <header className="hdr">
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Memory Ingest</div>
          <h1>Choose a character</h1>
          <p>
            Pick whose conversations you want to fold into long-term memory.
          </p>
        </div>
      </header>

      {characters.length === 0 ? (
        <div
          style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}
        >
          Loading characters…
        </div>
      ) : (
        <div className="grid">
          {characters.map((c, i) => (
            <button
              key={c.id}
              className="card"
              style={{ animationDelay: `${i * 55}ms` }}
              onClick={() => onPick(c)}
            >
              <div className="thumb-wrap">
                <span className="pick-tag">
                  {String((c.data.data.tags ?? [])[0] ?? "character")}
                </span>
                <img className="thumb" src={portraits[c.id]} alt="" />
              </div>
              <div className="body">
                <p className="name">{c.data.data.name}</p>
                <p className="tagline">
                  {String(
                    c.data.data.extensions?.tagline ??
                      c.data.data.personality ??
                      "",
                  )}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ================================================================== */
/* Screen 2 — Detail + config                                          */
/* ================================================================== */
function Detail({
  character,
  portrait,
  config,
  setConfig,
  onBack,
  onStart,
}: {
  character: LaylaCharacter;
  portrait: string;
  config: IngestConfig;
  setConfig: (c: IngestConfig) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const d = character.data.data;
  const set = (k: keyof IngestConfig) => (v: string) =>
    setConfig({ ...config, [k]: v });

  return (
    <>
      <header className="hdr">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          {"\u2190"}
        </button>
        <div>
          <div className="eyebrow">Configure ingest</div>
          <h1>{d.name}</h1>
        </div>
      </header>

      <div className="detail-hero">
        <img className="portrait lg" src={portrait} alt="" />
        <div className="meta">
          <div className="tagline">
            {String(d.extensions?.tagline ?? d.personality ?? "")}
          </div>
          <div className="chips">
            {(d.tags ?? []).map((t) => (
              <span className="chip" key={t}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="desc">{d.description}</p>

      <div className="section-label">
        <span className="dot" />
        <span className="txt">How memories are processed</span>
        <span className="hint">4 settings</span>
      </div>

      <div className="config-card">
        <header>
          <span className="badge">{"\uD83D\uDCDD"}</span>
          <div>
            <h3>Summarising conversations</h3>
            <p className="sub">Condense each chat into durable memories</p>
          </div>
        </header>
        <Field
          label="System prompt"
          value={config.summarySystem}
          onChange={set("summarySystem")}
          rows={3}
        />
        <Field
          label="Custom instruction"
          value={config.summaryInstruction}
          onChange={set("summaryInstruction")}
          rows={2}
        />
      </div>

      <div className="config-card graph">
        <header>
          <span className="badge">{"\uD83D\uDD78\uFE0F"}</span>
          <div>
            <h3>Constructing the knowledge graph</h3>
            <p className="sub">Link memories into entities and relationships</p>
          </div>
        </header>
        <Field
          label="System prompt"
          value={config.graphSystem}
          onChange={set("graphSystem")}
          rows={3}
        />
        <Field
          label="Custom instruction"
          value={config.graphInstruction}
          onChange={set("graphInstruction")}
          rows={2}
        />
      </div>

      <div className="cta-bar">
        <button className="btn btn-primary" onClick={onStart}>
          {"\u2728"} Start ingesting memories
        </button>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <textarea
        className="textarea"
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/* ================================================================== */
/* Screen 3 — Ingest                                                   */
/* ================================================================== */
interface LogRow {
  id: number;
  kind: "system" | "memory" | "entity";
  tick: string;
  text: string;
  bold?: string;
}
interface PlacedNode extends DemoEntity {
  x: number;
  y: number;
}
interface Particle {
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  dur: number;
}

const PHASES = ["Reading", "Summarising", "Graphing", "Done"] as const;
type PhaseIdx = 0 | 1 | 2 | 3;

const kindVar = (k: GraphNodeKind) => `var(--k-${k})`;

function Ingest({
  layla,
  character,
  portrait,
  config,
  onExit,
  onDone,
}: {
  layla: LaylaSDK;
  character: LaylaCharacter;
  portrait: string;
  config: IngestConfig;
  onExit: () => void;
  onDone: () => void;
}) {
  const lore = LORE[character.id] ?? {
    memories: [],
    entities: [],
    relations: [],
  };

  const stageRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 320, h: 360 });
  const dimsRef = useRef(dims);

  const [phase, setPhase] = useState<PhaseIdx>(0);
  const [phaseProg, setPhaseProg] = useState(0); // 0..1 within current phase
  const [overall, setOverall] = useState(0); // 0..1
  const [rows, setRows] = useState<LogRow[]>([]);
  const [nodes, setNodes] = useState<PlacedNode[]>([]);
  const [edges, setEdges] = useState<{ from: PlacedNode; to: PlacedNode }[]>(
    [],
  );
  const [particles, setParticles] = useState<Particle[]>([]);
  const [finished, setFinished] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const rowId = useRef(0);
  const partId = useRef(0);

  // measure stage
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const next = { w: el.clientWidth, h: el.clientHeight };
      dimsRef.current = next;
      setDims(next);
    });
    ro.observe(el);
    const init = { w: el.clientWidth, h: el.clientHeight };
    dimsRef.current = init;
    setDims(init);
    return () => ro.disconnect();
  }, []);

  const pushRow = useCallback((r: Omit<LogRow, "id">) => {
    setRows((prev) => {
      const next = [...prev, { ...r, id: rowId.current++ }];
      return next.slice(-40);
    });
  }, []);

  const setWeighted = useCallback((p: PhaseIdx, within: number) => {
    setPhaseProg(within);
    // weights: read .12, summarise .46, graph .42
    const base = p === 0 ? 0 : p === 1 ? 0.12 : 0.58;
    const span = p === 0 ? 0.12 : p === 1 ? 0.46 : 0.42;
    setOverall(Math.min(1, base + span * within));
  }, []);

  // layout positions for entities around the core
  const placeNode = useCallback(
    (entity: DemoEntity, index: number, total: number): PlacedNode => {
      const { w, h } = dimsRef.current;
      const cx = w / 2;
      const cy = h / 2;
      const ring = index % 2 === 0 ? 0 : 1;
      const radius = ring === 0 ? Math.min(w, h) * 0.3 : Math.min(w, h) * 0.42;
      // golden-angle distribution + slight per-ring offset
      const angle = index * 2.399963 + (ring === 1 ? 0.6 : 0);
      const jitter = ((index * 53) % 17) / 17 - 0.5;
      const r = radius + jitter * 18;
      const x = cx + Math.cos(angle) * r * 1.18; // widen horizontally
      const y = cy + Math.sin(angle) * r;
      const pad = 60;
      void total;
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
    for (let i = 0; i < 3; i++) {
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
        id: partId.current++,
        x0: start.x - target.x,
        y0: start.y - target.y,
        x: target.x,
        y: target.y,
        dur: 1.6 + Math.random() * 1.4,
      });
    }
    setParticles((prev) => [...prev, ...created]);
    const ids = created.map((c) => c.id);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !ids.includes(p.id)));
    }, 3200);
  }, []);

  // the ingest engine
  const runRef = useRef(false);
  useEffect(() => {
    if (runRef.current) return; // StrictMode guard
    runRef.current = true;
    const ac = new AbortController();
    abortRef.current = ac;
    const { signal } = ac;

    (async () => {
      try {
        /* ---- Phase 0: read conversations ---- */
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
        await sleep(280, signal);
        const transcripts: string[] = [];
        for (let i = 0; i < sessions.length; i++) {
          const history = await layla.chat.getChatHistory(
            sessions[i].session_id,
            0,
            50,
            { signal },
          );
          const text = history
            .slice()
            .reverse()
            .map((h) => `${h.name}: ${h.content}`)
            .join("\n");
          transcripts.push(text);
          pushRow({
            kind: "system",
            tick: "READ",
            text: "Loaded session",
            bold: `#${i + 1} \u00b7 ${history.length} messages`,
          });
          setWeighted(0, (i + 1) / sessions.length);
          await sleep(260, signal);
        }

        /* ---- Phase 1: summarise each conversation (real LLM stream) ---- */
        setPhase(1);
        for (let i = 0; i < transcripts.length; i++) {
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
          await stream.finalContent(); // genuinely waits on the model
          // surface the durable memory mined from this session
          const memo = lore.memories[i % Math.max(1, lore.memories.length)];
          if (memo) pushRow({ kind: "memory", tick: "MEMORY", text: memo });
          setWeighted(1, (i + 1) / transcripts.length);
          await sleep(160, signal);
        }
        // any remaining memories beyond session count
        for (let i = transcripts.length; i < lore.memories.length; i++) {
          pushRow({ kind: "memory", tick: "MEMORY", text: lore.memories[i] });
          await sleep(420, signal);
        }

        /* ---- Phase 2: construct knowledge graph ---- */
        setPhase(2);
        // Fire a real graph-construction call (tagged so the mock answers in JSON).
        // In production you would parse entities/relations from this response;
        // here we reveal the demo lore for a deterministic, legible constellation.
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

        const placed: PlacedNode[] = lore.entities.map((e, i) =>
          placeNode(e, i, lore.entities.length),
        );
        const byId = new Map(placed.map((n) => [n.id, n]));
        for (let i = 0; i < placed.length; i++) {
          const node = placed[i];
          setNodes((prev) => [...prev, node]);
          spawnParticles(node);
          pushRow({
            kind: "entity",
            tick: "ENTITY",
            text: `${KIND_ICON[node.kind]} ${node.kind}`,
            bold: node.label,
          });
          // connect any relations whose endpoints are now both present
          setEdges(() => {
            const present = new Set(placed.slice(0, i + 1).map((n) => n.id));
            return lore.relations
              .filter((r) => present.has(r.from) && present.has(r.to))
              .map((r) => ({ from: byId.get(r.from)!, to: byId.get(r.to)! }));
          });
          setWeighted(2, (i + 1) / placed.length);
          await sleep(640, signal);
        }

        /* ---- Done ---- */
        setPhase(3);
        setOverall(1);
        pushRow({
          kind: "system",
          tick: "COMMIT",
          text: "Knowledge graph written to memory",
        });
        await sleep(500, signal);
        setFinished(true);
      } catch (err) {
        if (err instanceof LaylaAbortError) return; // user cancelled
        pushRow({
          kind: "system",
          tick: "ERROR",
          text: (err as Error).message,
        });
      }
    })();

    return () => {
      runRef.current = false;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = () => {
    abortRef.current?.abort();
    onExit();
  };

  const pct = Math.round(overall * 100);
  const R = 64;
  const C = 2 * Math.PI * R;

  return (
    <div className="ingest">
      <header className="hdr">
        {!finished && (
          <button className="icon-btn" onClick={cancel} aria-label="Cancel">
            {"\u2715"}
          </button>
        )}
        <div>
          <div className="eyebrow">
            {finished ? "Complete" : `${PHASES[phase]}\u2026`}
          </div>
          <h1>
            {finished
              ? "Memories ingested"
              : `Ingesting ${character.data.data.name}`}
          </h1>
        </div>
      </header>

      {/* stage */}
      <div className="stage" ref={stageRef}>
        <svg className="edges">
          <defs>
            <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--energy-a)" />
              <stop offset="100%" stopColor="var(--energy-b)" />
            </linearGradient>
          </defs>
          {edges.map((e, i) => (
            <line
              key={i}
              className="edge"
              x1={e.from.x}
              y1={e.from.y}
              x2={e.to.x}
              y2={e.to.y}
            />
          ))}
        </svg>

        <div className="particles">
          {particles.map((p) => (
            <span
              key={p.id}
              className="particle"
              style={
                {
                  left: p.x,
                  top: p.y,
                  "--x0": `${p.x0}px`,
                  "--y0": `${p.y0}px`,
                  "--dur": `${p.dur}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>

        <div className="nodes">
          {nodes.map((n, i) => (
            <span
              key={n.id}
              className="gnode"
              style={
                {
                  left: n.x,
                  top: n.y,
                  "--nc": kindVar(n.kind),
                  animationDelay: `${i * 20}ms`,
                } as React.CSSProperties
              }
            >
              <span className="bead" />
              {n.label}
            </span>
          ))}
        </div>

        <div className="core">
          <div className="halo" />
          <svg className="ring" viewBox="0 0 152 152" width="152" height="152">
            <defs>
              <linearGradient id="energy" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--energy-b)" />
                <stop offset="100%" stopColor="var(--energy-a)" />
              </linearGradient>
            </defs>
            <circle className="track" cx="76" cy="76" r={R} />
            <circle
              className="prog"
              cx="76"
              cy="76"
              r={R}
              strokeDasharray={C}
              strokeDashoffset={C * (1 - overall)}
            />
          </svg>
          <img src={portrait} alt="" />
          <span className="pct">{pct}%</span>
        </div>
      </div>

      {/* phase stepper */}
      <div className="phases">
        {(["Reading", "Summarising", "Graphing"] as const).map((name, i) => {
          const state =
            phase > i || finished ? "done" : phase === i ? "active" : "";
          const fill = phase > i || finished ? 1 : phase === i ? phaseProg : 0;
          return (
            <div className={`phase ${state}`} key={name}>
              <div className="pname">
                {state === "active" && <span className="spin" />}
                {state === "done" && <span>{"\u2713"}</span>}
                {name}
              </div>
              <div className="pbar">
                <i style={{ width: `${fill * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {!finished ? (
        <div className="log">
          <div className="roll">
            {rows.map((r) => (
              <div className={`log-row ${r.kind}`} key={r.id}>
                <span className="tick">{r.tick}</span>
                <span className="what">
                  {r.text} {r.bold && <b>{r.bold}</b>}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Summary
          memories={lore.memories.length}
          entities={lore.entities.length}
          relations={lore.relations.length}
          name={character.data.data.name}
          onDone={onDone}
          onAgain={onExit}
        />
      )}
    </div>
  );
}

function Summary({
  memories,
  entities,
  relations,
  name,
  onDone,
  onAgain,
}: {
  memories: number;
  entities: number;
  relations: number;
  name: string;
  onDone: () => void;
  onAgain: () => void;
}) {
  return (
    <div className="summary">
      <div className="seal">{"\u2713"}</div>
      <h2>{name} remembers</h2>
      <p>
        Conversations have been folded into long-term memory and wired into a
        knowledge graph.
      </p>
      <div className="stats">
        <div className="stat">
          <div className="n">{memories}</div>
          <div className="l">Memories</div>
        </div>
        <div className="stat">
          <div className="n">{entities}</div>
          <div className="l">Entities</div>
        </div>
        <div className="stat">
          <div className="n">{relations}</div>
          <div className="l">Links</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-ghost" onClick={onAgain}>
          Re-run
        </button>
        <button className="btn btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
