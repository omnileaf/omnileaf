<script lang="ts">
  import { Folder, Lock, Sparkles } from "@lucide/svelte";

  import { m } from "$lib/paraglide/messages.js";

  import AppIcon from "./AppIcon.svelte";
  import type { DeviceKind } from "./device";
  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import WidthWording from "./WidthWording.svelte";
  import { atEveryWidth, type WordingByWidth } from "./wording";

  const PROMISE_ICON_SIZE = 20;

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
  <div class="flex flex-1 flex-col justify-center gap-lg">
    <AppIcon
      class="block-welcome-app-icon inline-welcome-app-icon medium:hidden"
    />
    <h1 tabindex="-1" class="text-display font-bold">
      {m.first_launch_welcome_title()}
    </h1>
    <p class="text-muted"><WidthWording wording={BODY[device]} /></p>
    <ul class="mbs-sm flex flex-col gap-md">
      {#each PROMISES[device] as promise (promise.title)}
        <li class="flex items-center gap-md">
          <span
            class="flex shrink-0 items-center justify-center rounded-control bg-accent-soft block-icon-tile inline-icon-tile medium:hidden"
          >
            <promise.icon size={PROMISE_ICON_SIZE} aria-hidden="true" />
          </span>
          <span
            class="hidden shrink-0 rounded-full bg-accent block-step-dot inline-step-dot medium:block"
          ></span>
          <span class="flex flex-col">
            <span class="font-semibold">{promise.title()}</span>
            <span class="text-caption text-muted">
              <WidthWording wording={promise.detail} />
            </span>
          </span>
        </li>
      {/each}
    </ul>
  </div>
  {#snippet actions()}
    <StepButton kind="primary" onclick={onNext}>
      {m.first_launch_get_started()}
    </StepButton>
  {/snippet}
</StepFrame>
