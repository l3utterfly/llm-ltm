import { useMemo } from "react";
import { LaylaSDK } from "@layla-network/sdk";
import { LORE, type DemoLore } from "./demo/data";
import { CharacterPicker } from "./features/memoryIngest/screens/CharacterPicker";
import { CharacterSettings } from "./features/memoryIngest/screens/CharacterSettings";
import { Ingesting } from "./features/memoryIngest/screens/Ingesting";
import { useCharacterCatalog } from "./features/memoryIngest/useCharacterCatalog";
import { useIngestFlow } from "./features/memoryIngest/useIngestFlow";

const EMPTY_LORE: DemoLore = {
  entities: [],
  memories: [],
  relations: [],
};

export default function App() {
  const layla = useMemo(() => new LaylaSDK(), []);
  const catalog = useCharacterCatalog(layla);
  const flow = useIngestFlow();
  const selected = flow.selectedCharacter;
  const portrait = selected ? (catalog.portraits[selected.id] ?? "") : "";
  const lore = selected ? (LORE[selected.id] ?? EMPTY_LORE) : EMPTY_LORE;

  return (
    <div className="app">
      {flow.screen === "picker" && (
        <CharacterPicker
          characters={catalog.characters}
          error={catalog.error}
          isLoading={catalog.isLoading}
          onPick={flow.openSettings}
          portraits={catalog.portraits}
        />
      )}

      {flow.screen === "settings" && selected && (
        <CharacterSettings
          character={selected}
          config={flow.config}
          onBack={flow.backToPicker}
          onStart={flow.startIngesting}
          portrait={portrait}
          setConfig={flow.setConfig}
        />
      )}

      {flow.screen === "ingesting" && selected && (
        <Ingesting
          character={selected}
          config={flow.config}
          layla={layla}
          lore={lore}
          onDone={flow.finishIngesting}
          onExit={flow.backToSettings}
          portrait={portrait}
        />
      )}
    </div>
  );
}
