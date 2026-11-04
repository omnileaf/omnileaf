export type ClipboardWriter = Pick<Clipboard, "writeText">;

export type CopyOutcome = "copied" | "selected";

export interface CopyRequest {
  readonly text: string;
  readonly clipboard: ClipboardWriter | undefined;
  readonly select: () => void;
}

async function written(
  text: string,
  clipboard: ClipboardWriter | undefined,
): Promise<boolean> {
  if (clipboard === undefined) {
    return false;
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function copyText({
  text,
  clipboard,
  select,
}: CopyRequest): Promise<CopyOutcome> {
  if (await written(text, clipboard)) {
    return "copied";
  }
  select();
  return "selected";
}
