import {
  LaylaAbortError,
  LaylaSDK,
  type LaylaCharacter,
} from "@layla-network/sdk";

export function hydrateCharacterImage(
  character: LaylaCharacter,
  imageSrc: string,
): LaylaCharacter {
  return {
    ...character,
    data: {
      ...character.data,
      data: {
        ...character.data.data,
        extensions: {
          ...character.data.data.extensions,
          image: imageSrc,
        },
      },
    },
  };
}

export async function resolvePortrait(
  layla: LaylaSDK,
  character: LaylaCharacter,
  signal?: AbortSignal,
): Promise<string> {
  const embedded = character.data.data.extensions?.image;

  try {
    const src = await layla.characters.getImage(character.id, { signal });
    if (src) return src;
  } catch (error) {
    if (error instanceof LaylaAbortError) return "";
  }

  return typeof embedded === "string" ? embedded : "";
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new LaylaAbortError("aborted"));
      return;
    }

    const timeout = window.setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new LaylaAbortError("aborted"));
      },
      { once: true },
    );
  });
