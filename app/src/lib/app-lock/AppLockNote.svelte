<script lang="ts">
  import { ROW_SUBTITLE_MUTED_TYPE } from "#lib/components/ui/item/looks.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { FLUSH_BLEED } from "#lib/settings/android-flush-look.ts";

  const android = new AndroidPhone();
</script>

{#if android.isOn}
  <div
    class="{FLUSH_BLEED} flex flex-col items-center gap-lg px-xl pbs-lg pbe-lock-note-end text-center {ROW_SUBTITLE_MUTED_TYPE}"
  >
    <svg
      viewBox="0 0 80 80"
      aria-hidden="true"
      focusable="false"
      class="block-lock-art inline-lock-art"
    >
      <rect width="80" height="80" rx="20" class="fill-accent-soft" />
      <rect
        x="22"
        y="12"
        width="36"
        height="76"
        rx="9"
        stroke-width="3"
        class="fill-background stroke-accent"
      />
      <path
        d="M33 45v-5a7 7 0 0 1 14 0v5"
        stroke-width="3"
        stroke-linecap="round"
        class="fill-none stroke-accent"
      />
      <rect x="29" y="44" width="22" height="16" rx="4" class="fill-accent" />
    </svg>
    <p>{m.app_lock_note()}</p>
  </div>
{:else}
  <p class="text-footnote text-muted">{m.app_lock_note()}</p>
{/if}
