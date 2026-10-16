<script lang="ts">
  import { CircleAlert } from "@lucide/svelte";

  import { invalidate } from "$app/navigation";
  import {
    Alert,
    AlertActions,
    AlertButton,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import { m } from "#lib/paraglide/messages.js";
  import IncludedRows from "#lib/problem-report/IncludedRows.svelte";
  import { PROBLEM_REPORT } from "#lib/problem-report/problem-report.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<SectionHeading
  title={m.about_report_problem()}
  parent={{ route: "/(app)/settings/about", title: m.about_title() }}
/>
<div class="mbs-pane-gap flex flex-col gap-sm">
  <p class="text-detail text-muted">{m.report_intro()}</p>
  {#if data.report.status === "ok"}
    <IncludedRows report={data.report.data} />
  {:else}
    <Alert tone="warning" icon={CircleAlert} role="alert">
      <AlertTitle>{m.report_failed()}</AlertTitle>
      <AlertActions>
        <AlertButton
          emphasis="quiet"
          onclick={() => {
            void invalidate(PROBLEM_REPORT);
          }}
        >
          {m.report_try_again()}
        </AlertButton>
      </AlertActions>
    </Alert>
  {/if}
</div>
