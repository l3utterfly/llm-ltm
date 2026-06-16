import { useCallback, useState } from "react";
import type { LaylaCharacter } from "@layla-network/sdk";
import { DEFAULT_CONFIG } from "./config";
import type { AppScreen, IngestConfig } from "./types";

export function useIngestFlow() {
  const [screen, setScreen] = useState<AppScreen>("picker");
  const [selectedCharacter, setSelectedCharacter] =
    useState<LaylaCharacter | null>(null);
  const [config, setConfig] = useState<IngestConfig>(DEFAULT_CONFIG);

  const openSettings = useCallback((character: LaylaCharacter) => {
    setSelectedCharacter(character);
    setConfig(DEFAULT_CONFIG);
    setScreen("settings");
  }, []);

  const backToPicker = useCallback(() => {
    setScreen("picker");
  }, []);

  const startIngesting = useCallback(() => {
    if (!selectedCharacter) return;

    setScreen("ingesting");
  }, [selectedCharacter]);

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

  return {
    backToPicker,
    backToSettings,
    config,
    finishIngesting,
    openSettings,
    screen,
    selectedCharacter,
    setConfig,
    startIngesting,
  };
}
