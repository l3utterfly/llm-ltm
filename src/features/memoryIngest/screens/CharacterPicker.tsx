import type { LaylaCharacter } from "@layla-network/sdk";

interface CharacterPickerProps {
  characters: LaylaCharacter[];
  error: string | null;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onPick: (character: LaylaCharacter) => void;
  portraits: Record<string, string>;
}

export function CharacterPicker({
  characters,
  error,
  hasMore,
  isLoading,
  isLoadingMore,
  onLoadMore,
  onPick,
  portraits,
}: CharacterPickerProps) {
  const hasCharacters = characters.length > 0;

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

      {error && !hasCharacters ? (
        <div className="empty-state">Unable to load characters: {error}</div>
      ) : isLoading && !hasCharacters ? (
        <div className="empty-state">Loading characters...</div>
      ) : !hasCharacters ? (
        <div className="empty-state">No characters found.</div>
      ) : (
        <>
          <div className="grid">
            {characters.map((character, index) => {
              const data = character.data.data;
              const tag = String((data.tags ?? [])[0] ?? "character");
              const tagline = String(
                data.extensions?.tagline ?? data.personality ?? "",
              );
              const portrait = portraits[character.id];
              const initial = data.name.trim().charAt(0).toUpperCase();

              return (
                <button
                  className="card"
                  key={character.id}
                  onClick={() => onPick(character)}
                  style={{ animationDelay: `${index * 55}ms` }}
                >
                  <div className="thumb-wrap">
                    <span className="pick-tag">{tag}</span>
                    {portrait ? (
                      <img alt="" className="thumb" src={portrait} />
                    ) : (
                      <div className="thumb thumb-placeholder">{initial}</div>
                    )}
                  </div>
                  <div className="body">
                    <p className="name">{data.name}</p>
                    <p className="tagline">{tagline}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="pagination-note error">
              Unable to load more characters: {error}
            </div>
          )}

          {hasMore ? (
            <div className="pagination">
              <button
                className="btn btn-ghost"
                disabled={isLoadingMore}
                onClick={onLoadMore}
              >
                {isLoadingMore ? "Loading..." : "Load more"}
              </button>
            </div>
          ) : (
            <div className="pagination-note">All characters loaded.</div>
          )}
        </>
      )}
    </>
  );
}
