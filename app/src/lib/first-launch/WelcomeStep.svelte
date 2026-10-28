<script lang="ts">
  import { Folder, Lock, Sparkles } from "@lucide/svelte";

  import { currentPlatform } from "#lib/page/platform.ts";
  import WidthWording from "#lib/page/WidthWording.svelte";
  import { atEveryWidth, type WordingByWidth } from "#lib/page/wording.ts";
  import { m } from "#lib/paraglide/messages.js";

  import AppIcon from "./AppIcon.svelte";
  import type { DeviceKind } from "./device";
  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import { usesSetupPages } from "./setup-pages.ts";
  import StepHeader from "./StepHeader.svelte";

  const PROMISE_ICON_SIZE = 20;

  const isSetupPage = usesSetupPages(currentPlatform());

  let { device, onNext }: { device: DeviceKind; onNext: () => void } = $props();

  const BODY = {
    phone: {
      onPhones: m.first_launch_welcome_body_phone,
      fromMedium: m.first_launch_welcome_body_tablet,
    },
    desktop: atEveryWidth(m.first_launch_welcome_body_desktop),
  } satisfies Record<DeviceKind, WordingByWidth>;

  const PROMISES = {
    phone: [
      {
        icon: Folder,
        title: m.first_launch_promise_folders,
        detail: atEveryWidth(m.first_launch_promise_folders_detail_phone),
      },
      {
        icon: Sparkles,
        title: m.first_launch_promise_reading,
        detail: atEveryWidth(m.first_launch_promise_reading_detail_phone),
      },
      {
        icon: Lock,
        title: m.first_launch_promise_private_phone,
        detail: {
          onPhones: m.first_launch_promise_private_detail_phone,
          fromMedium: m.first_launch_promise_private_detail_tablet,
        },
      },
    ],
    desktop: [
      {
        icon: Folder,
        title: m.first_launch_promise_folders,
        detail: atEveryWidth(m.first_launch_promise_folders_detail_desktop),
      },
      {
        icon: Sparkles,
        title: m.first_launch_promise_reading,
        detail: atEveryWidth(m.first_launch_promise_reading_detail_desktop),
      },
      {
        icon: Lock,
        title: m.first_launch_promise_private_desktop,
        detail: atEveryWidth(m.first_launch_promise_private_detail_desktop),
      },
    ],
  } satisfies Record<DeviceKind, readonly unknown[]>;
</script>

<StepFrame step="welcome">
  <StepHeader scale="welcome">
    {#snippet badge()}
      <div class={["flex pbe-sm", !isSetupPage && "pbs-xl"]}>
        <AppIcon
          class={isSetupPage
            ? "block-setup-app-icon inline-setup-app-icon"
            : "block-app-icon inline-app-icon"}
        />
      </div>
    {/snippet}
    {m.first_launch_welcome_title()}
    {#snippet lead()}
      <WidthWording wording={BODY[device]} />
    {/snippet}
  </StepHeader>
  <ul
    class={[
      "mbs-sm flex flex-col",
      isSetupPage ? "gap-lg pbs-md" : "gap-promise-gap",
    ]}
  >
    {#each PROMISES[device] as promise (promise.title)}
      <li
        class={[
          "flex gap-promise-gap",
          isSetupPage ? "items-start" : "items-center",
        ]}
      >
        <span
          class={[
            "flex shrink-0 items-center justify-center",
            isSetupPage
              ? "text-windows-accent"
              : "rounded-control bg-step-tint text-accent block-promise-tile inline-promise-tile",
          ]}
        >
          <promise.icon size={PROMISE_ICON_SIZE} aria-hidden="true" />
        </span>
        <span class="flex flex-col">
          <span
            class={isSetupPage
              ? "text-label/setup-body font-semibold"
              : "font-semibold"}>{promise.title()}</span
          >
          <span class="text-footnote text-muted">
            <WidthWording wording={promise.detail} />
          </span>
        </span>
      </li>
    {/each}
  </ul>
  {#snippet actions()}
    <StepButton kind="primary" onclick={onNext}>
      {m.first_launch_get_started()}
    </StepButton>
  {/snippet}
</StepFrame>
