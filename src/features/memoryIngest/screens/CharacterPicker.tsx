import type { LaylaCharacter } from "@layla-network/sdk";

interface CharacterPickerProps {
  characters: LaylaCharacter[];
  error: string | null;
  isLoading: boolean;
  onPick: (character: LaylaCharacter) => void;
  portraits: Record<string, string>;
}

export function CharacterPicker({
  characters,
  error,
  isLoading,
  onPick,
  portraits,
}: CharacterPickerProps) {
  return (
    <>
      <header className="hdr">
        <div className="grow">
          <div className="eyebrow">Memory Ingest</div>
          <h1>Choose a character</h1>
          <p>
            Pick whose conversations you want to fold into long-term memory.
          </p>
        </div>
      </header>

      {error ? (
        <div className="empty-state">Unable to load characters: {error}</div>
      ) : isLoading && characters.length === 0 ? (
        <div className="empty-state">Loading characters...</div>
      ) : (
        <div className="grid">
          {characters.map((character, index) => {
            const data = character.data.data;
            const tag = String((data.tags ?? [])[0] ?? "character");
            const tagline = String(
              data.extensions?.tagline ?? data.personality ?? "",
            );

            return (
              <button
                className="card"
                key={character.id}
                onClick={() => onPick(character)}
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <div className="thumb-wrap">
                  <span className="pick-tag">{tag}</span>
                  <img
                    alt=""
                    className="thumb"
                    src={portraits[character.id]}
                  />
                </div>
                <div className="body">
                  <p className="name">{data.name}</p>
                  <p className="tagline">{tagline}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
