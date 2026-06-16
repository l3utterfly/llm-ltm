import type { CSSProperties } from "react";
import type { LaylaCharacter, LaylaSDK } from "@layla-network/sdk";
import { INGEST_PHASES, kindColorVar } from "../config";
import { useIngestAnimation } from "../useIngestAnimation";
import type { IngestConfig } from "../types";
import { Summary } from "../components/Summary";

interface IngestingProps {
  character: LaylaCharacter;
  config: IngestConfig;
  layla: LaylaSDK;
  onDone: () => void;
  onExit: () => void;
  portrait: string;
}

export function Ingesting({
  character,
  config,
  layla,
  onDone,
  onExit,
  portrait,
}: IngestingProps) {
  const {
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
    stats,
  } = useIngestAnimation({ character, config, layla });
  const pct = Math.round(overall * 100);
  const radius = 64;
  const circumference = 2 * Math.PI * radius;

  const cancel = () => {
    abort();
    onExit();
  };

  return (
    <div className="ingest">
      <header className="hdr">
        {!finished && (
          <button className="icon-btn" onClick={cancel} aria-label="Cancel">
            {"×"}
          </button>
        )}
        <div>
          <div className="eyebrow">
            {finished
              ? "Complete"
              : `${INGEST_PHASES[phase]}...`}
          </div>
          <h1>
            {finished
              ? "Memories ingested"
              : `Ingesting ${character.data.data.name}`}
          </h1>
        </div>
      </header>

      <div className="stage" ref={stageRef}>
        <svg className="edges">
          <defs>
            <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--energy-a)" />
              <stop offset="100%" stopColor="var(--energy-b)" />
            </linearGradient>
          </defs>
          {edges.map((edge, index) => (
            <line
              className="edge"
              key={index}
              x1={edge.from.x}
              x2={edge.to.x}
              y1={edge.from.y}
              y2={edge.to.y}
            />
          ))}
        </svg>

        <div className="particles">
          {particles.map((particle) => (
            <span
              className="particle"
              key={particle.id}
              style={
                {
                  left: particle.x,
                  top: particle.y,
                  "--x0": `${particle.x0}px`,
                  "--y0": `${particle.y0}px`,
                  "--dur": `${particle.dur}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>

        <div className="nodes">
          {nodes.map((node, index) => (
            <span
              className="gnode"
              key={node.id}
              style={
                {
                  left: node.x,
                  top: node.y,
                  "--nc": kindColorVar(node.kind),
                  animationDelay: `${index * 20}ms`,
                } as CSSProperties
              }
            >
              <span className="bead" />
              {node.label}
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
            <circle className="track" cx="76" cy="76" r={radius} />
            <circle
              className="prog"
              cx="76"
              cy="76"
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - overall)}
            />
          </svg>
          <img src={portrait} alt="" />
          <span className="pct">{pct}%</span>
        </div>
      </div>

      <div className="phases">
        {(["Reading", "Summarising", "Graphing"] as const).map(
          (name, index) => {
            const state =
              phase > index || finished
                ? "done"
                : phase === index
                  ? "active"
                  : "";
            const fill =
              phase > index || finished
                ? 1
                : phase === index
                  ? phaseProg
                  : 0;

            return (
              <div className={`phase ${state}`} key={name}>
                <div className="pname">
                  {state === "active" && <span className="spin" />}
                  {state === "done" && <span>{"✓"}</span>}
                  {name}
                </div>
                <div className="pbar">
                  <i style={{ width: `${fill * 100}%` }} />
                </div>
              </div>
            );
          },
        )}
      </div>

      {!finished ? (
        <div className="log">
          <div className="roll">
            {rows.map((row) => (
              <div className={`log-row ${row.kind}`} key={row.id}>
                <span className="tick">{row.tick}</span>
                <span className="what">
                  {row.text} {row.bold && <b>{row.bold}</b>}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Summary
          entities={stats.entities}
          memories={stats.memories}
          name={character.data.data.name}
          onAgain={onExit}
          onDone={onDone}
          relations={stats.relations}
        />
      )}
    </div>
  );
}
