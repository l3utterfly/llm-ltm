import type { LaylaSDK } from "@layla-network/sdk";
import { DEFAULT_CONFIG } from "./config";
import type { IngestConfig } from "./types";

const CONFIG_FILENAME = "config.json";

interface ConfigFile {
  version: 1;
  characters: Record<string, IngestConfig>;
}

const CONFIG_KEYS: Array<keyof IngestConfig> = [
  "summarySystem",
  "summaryInstruction",
  "graphSystem",
  "graphInstruction",
];

function encodeText(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }

  return btoa(binary);
}

function decodeText(contentBase64: string): string {
  const commaIndex = contentBase64.indexOf(",");
  const base64 =
    commaIndex >= 0 ? contentBase64.slice(commaIndex + 1) : contentBase64;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function normalizeConfig(value: unknown): IngestConfig {
  if (!value || typeof value !== "object") return DEFAULT_CONFIG;

  const record = value as Partial<Record<keyof IngestConfig, unknown>>;
  return CONFIG_KEYS.reduce<IngestConfig>(
    (nextConfig, key) => ({
      ...nextConfig,
      [key]:
        typeof record[key] === "string" ? record[key] : DEFAULT_CONFIG[key],
    }),
    DEFAULT_CONFIG,
  );
}

function parseConfigFile(json: string): ConfigFile {
  const parsed = JSON.parse(json) as Partial<ConfigFile>;
  const characters =
    parsed.characters && typeof parsed.characters === "object"
      ? parsed.characters
      : {};

  return {
    version: 1,
    characters: Object.fromEntries(
      Object.entries(characters).map(([characterId, config]) => [
        characterId,
        normalizeConfig(config),
      ]),
    ),
  };
}

async function readConfigFile(
  layla: LaylaSDK,
  signal?: AbortSignal,
): Promise<ConfigFile> {
  const result = await layla.utils.readFile(CONFIG_FILENAME, { signal });

  if (!result.content_base64) {
    return { version: 1, characters: {} };
  }

  return parseConfigFile(decodeText(result.content_base64));
}

export async function loadCharacterConfig(
  layla: LaylaSDK,
  characterId: string,
  signal?: AbortSignal,
): Promise<IngestConfig> {
  const file = await readConfigFile(layla, signal);
  return file.characters[characterId] ?? DEFAULT_CONFIG;
}

export async function saveCharacterConfig(
  layla: LaylaSDK,
  characterId: string,
  config: IngestConfig,
): Promise<void> {
  let file: ConfigFile;

  try {
    file = await readConfigFile(layla);
  } catch {
    file = { version: 1, characters: {} };
  }

  const nextFile: ConfigFile = {
    version: 1,
    characters: {
      ...file.characters,
      [characterId]: normalizeConfig(config),
    },
  };
  const result = await layla.utils.saveFile(
    CONFIG_FILENAME,
    encodeText(JSON.stringify(nextFile, null, 2)),
    false,
  );

  if (!result.success) {
    throw new Error(result.message ?? "Unable to save config.json");
  }
}
