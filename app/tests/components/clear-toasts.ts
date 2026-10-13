import { toast } from "svelte-sonner";
import { expect, vi } from "vitest";

export async function clearToasts(): Promise<void> {
  if (vi.isFakeTimers()) {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  }
  toast.dismiss();
  await expect
    .poll(() => document.querySelector("[data-sonner-toast]"))
    .toBeNull();
}
