import { LaylaAbortError, LaylaSDK, type LaylaCharacter } from "@layla-network/sdk";

export async function resolvePortrait(
  layla: LaylaSDK,
  character: LaylaCharacter,
): Promise<string> {
  const embedded = character.data.data.extensions?.image;

  if (typeof embedded === "string" && embedded.length > 0) {
    return embedded;
  }

  try {
    const src = await layla.characters.getImage(character.id);
    return src ?? "";
  } catch {
    return "";
  }
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
