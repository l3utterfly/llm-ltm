import { useCallback, useEffect, useRef, useState } from "react";
import type { LaylaCharacter, LaylaSDK } from "@layla-network/sdk";
import { DEFAULT_CONFIG } from "./config";
import { loadCharacterConfig, saveCharacterConfig } from "./configFile";
import type { AppScreen, IngestConfig } from "./types";

export type ConfigSaveState = "idle" | "loading" | "saving" | "saved" | "error";

export function useIngestFlow(layla: LaylaSDK) {
  const [screen, setScreen] = useState<AppScreen>("picker");
  const [selectedCharacter, setSelectedCharacter] =
    useState<LaylaCharacter | null>(null);
  const [config, setConfig] = useState<IngestConfig>(DEFAULT_CONFIG);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaveState, setConfigSaveState] =
    useState<ConfigSaveState>("idle");
  const lastAttemptedConfigRef = useRef<string | null>(null);
  const lastSavedConfigRef = useRef(JSON.stringify(DEFAULT_CONFIG));
  const loadControllerRef = useRef<AbortController | null>(null);
  const loadGenerationRef = useRef(0);
  const saveGenerationRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveTimeoutRef = useRef<number | null>(null);

  const clearSaveTimer = useCallback(() => {
    if (saveTimeoutRef.current === null) return;

    window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
  }, []);

  const persistConfig = useCallback(
    (characterId: string, nextConfig: IngestConfig) => {
      const serializedConfig = JSON.stringify(nextConfig);
      if (serializedConfig === lastSavedConfigRef.current) return;

      clearSaveTimer();
      lastAttemptedConfigRef.current = serializedConfig;
      setConfigSaveState("saving");

      const generation = saveGenerationRef.current + 1;
      saveGenerationRef.current = generation;
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(() => saveCharacterConfig(layla, characterId, nextConfig));

      void saveQueueRef.current
        .then(() => {
          if (saveGenerationRef.current !== generation) return;

          lastSavedConfigRef.current = serializedConfig;
          setConfigError(null);
          setConfigSaveState("saved");
        })
        .catch((error) => {
          if (saveGenerationRef.current !== generation) return;

          setConfigError((error as Error).message);
          setConfigSaveState("error");
        });
    },
    [clearSaveTimer, layla],
  );

  const openSettings = useCallback((character: LaylaCharacter) => {
    const controller = new AbortController();
    const generation = loadGenerationRef.current + 1;

    loadControllerRef.current?.abort();
    loadControllerRef.current = controller;
    loadGenerationRef.current = generation;
    saveGenerationRef.current += 1;
    setSelectedCharacter(character);
    setConfig(DEFAULT_CONFIG);
    lastAttemptedConfigRef.current = null;
    lastSavedConfigRef.current = JSON.stringify(DEFAULT_CONFIG);
    setConfigError(null);
    setConfigSaveState("loading");
    setScreen("settings");

    void saveQueueRef.current
      .catch(() => undefined)
      .then(() => loadCharacterConfig(layla, character.id, controller.signal))
      .then((storedConfig) => {
        if (
          controller.signal.aborted ||
          loadGenerationRef.current !== generation
        ) {
          return;
        }

        setConfig(storedConfig);
        lastSavedConfigRef.current = JSON.stringify(storedConfig);
        setConfigSaveState("idle");
      })
      .catch((error) => {
        if (
          controller.signal.aborted ||
          loadGenerationRef.current !== generation
        ) {
          return;
        }

        setConfig(DEFAULT_CONFIG);
        lastSavedConfigRef.current = JSON.stringify(DEFAULT_CONFIG);
        setConfigError((error as Error).message);
        setConfigSaveState("error");
      });
  }, [layla]);

  const backToPicker = useCallback(() => {
    if (selectedCharacter && configSaveState !== "loading") {
      persistConfig(selectedCharacter.id, config);
    }

    setScreen("picker");
  }, [config, configSaveState, persistConfig, selectedCharacter]);

  const startIngesting = useCallback(() => {
    if (!selectedCharacter) return;

    if (configSaveState !== "loading") {
      persistConfig(selectedCharacter.id, config);
    }

    setScreen("ingesting");
  }, [config, configSaveState, persistConfig, selectedCharacter]);

  const backToSettings = useCallback(() => {
    if (!selectedCharacter) {
      setScreen("picker");
      return;
    }

    setScreen("settings");
  }, [selectedCharacter]);

  const finishIngesting = useCallback(() => {
    setScreen("picker");
  }, []);

  useEffect(() => {
    if (
      screen !== "settings" ||
      !selectedCharacter ||
      configSaveState === "loading" ||
      configSaveState === "saving"
    ) {
      return;
    }

    const serializedConfig = JSON.stringify(config);
    if (serializedConfig === lastSavedConfigRef.current) return;
    if (
      configSaveState === "error" &&
      serializedConfig === lastAttemptedConfigRef.current
    ) {
      return;
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      persistConfig(selectedCharacter.id, config);
    }, 500);

    return clearSaveTimer;
  }, [
    clearSaveTimer,
    config,
    configSaveState,
    persistConfig,
    screen,
    selectedCharacter,
  ]);

  useEffect(
    () => () => {
      clearSaveTimer();
      loadControllerRef.current?.abort();
    },
    [clearSaveTimer],
  );

  return {
    backToPicker,
    backToSettings,
    config,
    configError,
    configSaveState,
    finishIngesting,
    openSettings,
    screen,
    selectedCharacter,
    setConfig,
    startIngesting,
  };
}
