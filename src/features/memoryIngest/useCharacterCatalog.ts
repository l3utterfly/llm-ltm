import { useCallback, useEffect, useRef, useState } from "react";
import type { LaylaCharacter, LaylaSDK } from "@layla-network/sdk";
import { hydrateCharacterImage, resolvePortrait } from "./layla";

const CHARACTER_PAGE_SIZE = 12;

interface CharacterCatalogState {
  characters: LaylaCharacter[];
  error: string | null;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  portraits: Record<string, string>;
}

interface CharacterCatalogResult extends CharacterCatalogState {
  loadNextPage: () => void;
}

export function useCharacterCatalog(layla: LaylaSDK): CharacterCatalogResult {
  const abortControllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const hasMoreRef = useRef(true);
  const isLoadingRef = useRef(false);
  const offsetRef = useRef(0);

  const [state, setState] = useState<CharacterCatalogState>({
    characters: [],
    error: null,
    hasMore: true,
    isLoading: true,
    isLoadingMore: false,
    portraits: {},
  });

  const hydratePageImages = useCallback(
    (
      characters: LaylaCharacter[],
      signal: AbortSignal,
      generation: number,
    ) => {
      void (async () => {
        for (const character of characters) {
          if (signal.aborted || generationRef.current !== generation) return;

          const src = await resolvePortrait(layla, character, signal);

          if (!src || signal.aborted || generationRef.current !== generation) {
            continue;
          }

          setState((current) => ({
            ...current,
            characters: current.characters.map((currentCharacter) =>
              currentCharacter.id === character.id
                ? hydrateCharacterImage(currentCharacter, src)
                : currentCharacter,
            ),
            portraits: {
              ...current.portraits,
              [character.id]: src,
            },
          }));
        }
      })();
    },
    [layla],
  );

  const loadPage = useCallback(
    async (offset: number, replace: boolean, signal: AbortSignal) => {
      if (isLoadingRef.current || (!replace && !hasMoreRef.current)) return;

      const generation = generationRef.current;
      isLoadingRef.current = true;

      setState((current) => ({
        ...current,
        error: null,
        isLoading: replace,
        isLoadingMore: !replace,
      }));

      try {
        const page = await layla.characters.list(
          offset,
          CHARACTER_PAGE_SIZE,
          { signal },
        );

        if (signal.aborted || generationRef.current !== generation) return;

        const nextHasMore = page.length === CHARACTER_PAGE_SIZE;
        hasMoreRef.current = nextHasMore;
        offsetRef.current = offset + page.length;

        setState((current) => {
          const existingIds = new Set(
            replace ? [] : current.characters.map((character) => character.id),
          );
          const nextCharacters = replace
            ? page
            : [
                ...current.characters,
                ...page.filter((character) => !existingIds.has(character.id)),
              ];

          return {
            ...current,
            characters: nextCharacters,
            hasMore: nextHasMore,
            isLoading: false,
            isLoadingMore: false,
          };
        });

        hydratePageImages(page, signal, generation);
      } catch (error) {
        if (signal.aborted || generationRef.current !== generation) return;

        setState((current) => ({
          ...current,
          error: (error as Error).message,
          isLoading: false,
          isLoadingMore: false,
        }));
      } finally {
        if (generationRef.current === generation) {
          isLoadingRef.current = false;
        }
      }
    },
    [hydratePageImages, layla],
  );

  const loadNextPage = useCallback(() => {
    const signal = abortControllerRef.current?.signal;
    if (!signal) return;

    void loadPage(offsetRef.current, false, signal);
  }, [loadPage]);

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    generationRef.current += 1;
    hasMoreRef.current = true;
    isLoadingRef.current = false;
    offsetRef.current = 0;

    setState({
      characters: [],
      error: null,
      hasMore: true,
      isLoading: true,
      isLoadingMore: false,
      portraits: {},
    });

    void loadPage(0, true, controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadNextPage, loadPage]);

  return {
    ...state,
    loadNextPage,
  };
}
