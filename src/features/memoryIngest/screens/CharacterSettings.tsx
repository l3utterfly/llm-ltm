import type { Dispatch, SetStateAction } from "react";
import type { LaylaCharacter } from "@layla-network/sdk";
import type { IngestConfig } from "../types";
import { Field } from "../components/Field";

interface CharacterSettingsProps {
  character: LaylaCharacter;
  config: IngestConfig;
  onBack: () => void;
  onStart: () => void;
  portrait: string;
  setConfig: Dispatch<SetStateAction<IngestConfig>>;
}

export function CharacterSettings({
  character,
  config,
  onBack,
  onStart,
  portrait,
  setConfig,
}: CharacterSettingsProps) {
  const data = character.data.data;
  const tagline = String(data.extensions?.tagline ?? data.personality ?? "");
  const setConfigValue = (key: keyof IngestConfig) => (value: string) =>
    setConfig((current) => ({ ...current, [key]: value }));

  return (
    <>
      <header className="hdr">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          {"←"}
        </button>
        <div>
          <div className="eyebrow">Configure ingest</div>
          <h1>{data.name}</h1>
        </div>
      </header>

      <div className="detail-hero">
        <img className="portrait lg" src={portrait} alt="" />
        <div className="meta">
          <div className="tagline">{tagline}</div>
          <div className="chips">
            {(data.tags ?? []).map((tag) => (
              <span className="chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="desc">{data.description}</p>

      <div className="section-label">
        <span className="dot" />
        <span className="txt">How memories are processed</span>
        <span className="hint">4 settings</span>
      </div>

      <div className="config-card">
        <header>
          <span className="badge">{"📝"}</span>
          <div>
            <h3>Summarising conversations</h3>
            <p className="sub">Condense each chat into durable memories</p>
          </div>
        </header>
        <Field
          label="System prompt"
          onChange={setConfigValue("summarySystem")}
          rows={3}
          value={config.summarySystem}
        />
        <Field
          label="Custom instruction"
          onChange={setConfigValue("summaryInstruction")}
          rows={2}
          value={config.summaryInstruction}
        />
      </div>

      <div className="config-card graph">
        <header>
          <span className="badge">{"🕸️"}</span>
          <div>
            <h3>Constructing the knowledge graph</h3>
            <p className="sub">Link memories into entities and relationships</p>
          </div>
        </header>
        <Field
          label="System prompt"
          onChange={setConfigValue("graphSystem")}
          rows={3}
          value={config.graphSystem}
        />
        <Field
          label="Custom instruction"
          onChange={setConfigValue("graphInstruction")}
          rows={2}
          value={config.graphInstruction}
        />
      </div>

      <div className="cta-bar">
        <button className="btn btn-primary" onClick={onStart}>
          {"✨"} Start ingesting memories
        </button>
      </div>
    </>
  );
}
