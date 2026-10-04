import type { ProbedFormat } from "#lib/ipc/bindings.ts";

export type FormatSamples = Readonly<Record<ProbedFormat, string>>;

/** A one-pixel image in each format some webviews can't show and pages can be transcoded from, made by each format's reference encoder. */
export const FORMAT_SAMPLES = {
  webp: "data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAABwAQCdASoBAAEAAUAmJaACdAFAAAD+8LprXFzZEUf/IMf4Nf5h81wA",
  jxl: "data:image/jxl;base64,/woAEBAJCAABADQASxiLFcJBER5gqN9jAA==",
} as const satisfies FormatSamples;

/** How long a one-pixel sample may take to decode, so a webview that never settles a decode can't hold a book from opening. */
const PROBE_TIMEOUT_MS = 500;

/** The formats whose sample this webview fails to decode, so the core sends their pages in a format it can. */
export async function undecodableFormats(
  samples: FormatSamples,
): Promise<ProbedFormat[]> {
  const formats = Object.keys(samples).filter(isProbedFormat);
  const decoded = await Promise.all(
    formats.map((format) => decodes(samples[format])),
  );
  return formats.filter((_, index) => decoded[index] === false);
}

/** Whether `decode` settles successfully within `timeoutMs`, a decode that never settles counting as a failure. */
export async function decodesWithin(
  decode: () => Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<false>((settle) => {
    timer = setTimeout(() => {
      settle(false);
    }, timeoutMs);
  });
  const settled = decode().then(
    () => true,
    () => false,
  );
  try {
    return await Promise.race([settled, late]);
  } finally {
    clearTimeout(timer);
  }
}

function isProbedFormat(key: string): key is ProbedFormat {
  return Object.hasOwn(FORMAT_SAMPLES, key);
}

function decodes(url: string): Promise<boolean> {
  const image = new Image();
  image.src = url;
  return decodesWithin(() => image.decode(), PROBE_TIMEOUT_MS);
}

let probed: Promise<ProbedFormat[]> | undefined;

/** The formats this webview can't decode, probed once on first use. */
export function webviewUndecodableFormats(): Promise<ProbedFormat[]> {
  probed ??= undecodableFormats(FORMAT_SAMPLES);
  return probed;
}
