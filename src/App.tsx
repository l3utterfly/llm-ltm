import { useMemo } from "react";
import { LaylaSDK } from "@layla-network/sdk";
import { CharacterPicker } from "./features/memoryIngest/screens/CharacterPicker";
import { CharacterSettings } from "./features/memoryIngest/screens/CharacterSettings";
import { Ingesting } from "./features/memoryIngest/screens/Ingesting";
import { useCharacterCatalog } from "./features/memoryIngest/useCharacterCatalog";
import { useIngestFlow } from "./features/memoryIngest/useIngestFlow";

export default function App() {
  const layla = useMemo(() => new LaylaSDK(), []);
  const catalog = useCharacterCatalog(layla);
  const flow = useIngestFlow(layla);
  const selected = flow.selectedCharacter;
  const portrait = selected ? (catalog.portraits[selected.id] ?? "") : "";

  return (
    <div className="app">
      {flow.screen === "picker" && (
        <CharacterPicker
          characters={catalog.characters}
          error={catalog.error}
          hasMore={catalog.hasMore}
          isLoading={catalog.isLoading}
          isLoadingMore={catalog.isLoadingMore}
          onLoadMore={catalog.loadNextPage}
          onPick={flow.openSettings}
          portraits={catalog.portraits}
        />
      )}

      {flow.screen === "settings" && selected && (
        <CharacterSettings
          character={selected}
          config={flow.config}
          configError={flow.configError}
          configSaveState={flow.configSaveState}
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
          onDone={flow.finishIngesting}
          onExit={flow.backToSettings}
          portrait={portrait}
        />
      )}
    </div>
  );
}
