import { tick } from "svelte";

export async function refreshAndFocus(
  refresh: () => Promise<unknown>,
  focusHeading: () => void,
): Promise<void> {
  await refresh();
  await tick();
  focusHeading();
}
