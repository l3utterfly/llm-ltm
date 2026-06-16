import type { DemoEntity } from "../../demo/data";

export type AppScreen = "picker" | "settings" | "ingesting";

export interface IngestConfig {
  summarySystem: string;
  summaryInstruction: string;
  graphSystem: string;
  graphInstruction: string;
}

export interface LogRow {
  id: number;
  kind: "system" | "memory" | "entity";
  tick: string;
  text: string;
  bold?: string;
}

export interface PlacedNode extends DemoEntity {
  x: number;
  y: number;
}

export interface GraphEdge {
  from: PlacedNode;
  to: PlacedNode;
}

export interface IngestStats {
  entities: number;
  memories: number;
  relations: number;
}

export interface Particle {
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  dur: number;
}

export type PhaseIdx = 0 | 1 | 2 | 3;
