<script lang="ts">
  import type { AboutLook, HintKind } from "./look";

  const LABELS = {
    phone: "",
    pane: "desktop:text-callout",
  } satisfies Record<AboutLook, string>;

  let {
    label,
    hint,
    hintKind = "prose",
    look,
  }: {
    label: string;
    hint: string;
    hintKind?: HintKind | undefined;
    look: AboutLook;
  } = $props();

  const isAddress = $derived(hintKind === "address");
</script>

<span class="flex flex-1 flex-col wrap-anywhere">
  <span class={["font-semibold", LABELS[look]]}>{label}</span>
  <span
    dir={isAddress ? "ltr" : undefined}
    translate={isAddress ? "no" : undefined}
    class="text-footnote text-muted">{hint}</span
  >
</span>
