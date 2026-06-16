interface SummaryProps {
  entities: number;
  memories: number;
  name: string;
  onAgain: () => void;
  onDone: () => void;
  relations: number;
}

export function Summary({
  entities,
  memories,
  name,
  onAgain,
  onDone,
  relations,
}: SummaryProps) {
  return (
    <div className="summary">
      <div className="seal">{"✓"}</div>
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
      <div className="summary-actions">
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
