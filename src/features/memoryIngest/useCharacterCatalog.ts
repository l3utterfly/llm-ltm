import { useEffect, useState } from "react";
import type { LaylaCharacter, LaylaSDK } from "@layla-network/sdk";
import { resolvePortrait } from "./layla";

interface CharacterCatalogState {
  characters: LaylaCharacter[];
  error: string | null;
  isLoading: boolean;
  portraits: Record<string, string>;
}

export function useCharacterCatalog(layla: LaylaSDK): CharacterCatalogState {
  const [state, setState] = useState<CharacterCatalogState>({
    characters: [],
    error: null,
    isLoading: true,
    portraits: {},
  });

  useEffect(() => {
    let alive = true;

    async function loadCatalog() {
      setState((current) => ({ ...current, error: null, isLoading: true }));

      try {
        const characters = await layla.characters.list(0, 12);

        if (!alive) return;

        setState((current) => ({
          ...current,
          characters,
          isLoading: false,
        }));

        const portraitPairs = await Promise.all(
          characters.map(
            async (character) =>
              [character.id, await resolvePortrait(layla, character)] as const,
          ),
        );

        if (!alive) return;

        setState((current) => ({
          ...current,
          portraits: Object.fromEntries(portraitPairs),
        }));
      } catch (error) {
        if (!alive) return;

        setState((current) => ({
          ...current,
          error: (error as Error).message,
          isLoading: false,
        }));
      }
    }

    void loadCatalog();

    return () => {
      alive = false;
    };
  }, [layla]);

  return state;
}
