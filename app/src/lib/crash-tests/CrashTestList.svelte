<script lang="ts">
  import { Bug, Play, Power, TriangleAlert } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";

  import CrashAndQuitDialog from "./CrashAndQuitDialog.svelte";
  import type { CrashTests } from "./crash-tests";

  type CrashTest = "panic" | "interfaceError" | "crashAndQuit";
  type Tone = "neutral" | "danger";

  interface CrashTestRow {
    readonly test: CrashTest;
    readonly icon: Glyph;
    readonly tone: Tone;
    readonly title: () => string;
    readonly body: () => string;
  }

  const ROWS: readonly CrashTestRow[] = [
    {
      test: "panic",
      icon: Bug,
      tone: "neutral",
      title: m.crash_test_panic,
      body: m.crash_test_panic_body,
    },
    {
      test: "interfaceError",
      icon: TriangleAlert,
      tone: "neutral",
      title: m.crash_test_interface,
      body: m.crash_test_interface_body,
    },
    {
      test: "crashAndQuit",
      icon: Power,
      tone: "danger",
      title: m.crash_test_quit,
      body: m.crash_test_quit_body,
    },
  ];

  const TONES = {
    neutral: { tile: "bg-chip", play: "text-muted" },
    danger: { tile: "bg-danger-soft text-danger", play: "text-danger" },
  } satisfies Record<Tone, { tile: string; play: string }>;

  const ICON_SIZE = 20;
  const PLAY_SIZE = 18;
  const SECTION_MARK = "\u0000";

  let {
    tests,
    version,
  }: {
    tests: Pick<
      CrashTests,
      "panicInCore" | "throwInterfaceError" | "crashAndQuit"
    >;
    version: string;
  } = $props();

  let isConfirmingCrash = $state(false);

  const RUNS = {
    panic: () => void tests.panicInCore(),
    interfaceError: () => {
      tests.throwInterfaceError();
    },
    crashAndQuit: () => {
      isConfirmingCrash = true;
    },
  } satisfies Record<CrashTest, () => void>;

  const [beforeSection = "", afterSection = ""] = m
    .crash_tests_follow_choice({ section: SECTION_MARK })
    .split(SECTION_MARK);

  const id = $props.id();
  const headingId = `${id}-heading`;
</script>

<section aria-labelledby={headingId} class="flex flex-col gap-sm">
  <h2
    id={headingId}
    class="text-footnote font-semibold text-muted touch:max-medium:px-xs touch:medium:text-label"
  >
    {m.crash_tests_title()}
  </h2>
  <ul
    class="divide-y divide-border overflow-hidden rounded-list border border-border bg-card"
  >
    {#each ROWS as row (row.test)}
      <li>
        <button
          type="button"
          aria-labelledby="{id}-{row.test}-title"
          aria-describedby="{id}-{row.test}-body"
          class="flex items-center gap-md px-list-row py-sm text-start transition-control inline-full min-block-row-compact hover:bg-hover active:bg-pressed touch:min-block-row touch:max-medium:gap-list-row touch:max-medium:py-action-row"
          onclick={RUNS[row.test]}
        >
          <span
            aria-hidden="true"
            class={[
              "flex shrink-0 items-center justify-center rounded-tile block-tile inline-tile",
              TONES[row.tone].tile,
            ]}
          >
            <row.icon
              size={ICON_SIZE}
              class="desktop:block-settings-icon desktop:inline-settings-icon"
            />
          </span>
          <span
            class="flex flex-1 flex-col min-inline-none touch:max-medium:gap-2xs"
          >
            <span
              id="{id}-{row.test}-title"
              class="font-semibold desktop:text-callout">{row.title()}</span
            >
            <span id="{id}-{row.test}-body" class="text-detail text-muted"
              >{row.body()}</span
            >
          </span>
          <Play
            size={PLAY_SIZE}
            aria-hidden="true"
            class={[
              "shrink-0 desktop:block-lg desktop:inline-lg",
              TONES[row.tone].play,
            ]}
          />
        </button>
      </li>
    {/each}
  </ul>
  <p class="mbs-xs text-detail text-muted touch:max-medium:px-xs">
    {beforeSection}<a
      href={resolve("/settings/privacy")}
      class="font-semibold text-accent underline underline-offset-2"
      >{m.privacy_title()}</a
    >{afterSection}
  </p>
</section>

<CrashAndQuitDialog
  isOpen={isConfirmingCrash}
  {version}
  onConfirm={() => {
    isConfirmingCrash = false;
    void tests.crashAndQuit();
  }}
  onCancel={() => {
    isConfirmingCrash = false;
  }}
/>
