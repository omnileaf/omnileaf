<script lang="ts">
  import { asset } from "$app/paths";

  import { SECURITY_EMAIL, SECURITY_TXT_ASSET } from "./links.ts";

  const mailto = `mailto:${SECURITY_EMAIL}`;
  const securityTxtUrl = asset(SECURITY_TXT_ASSET);
</script>

<section id="security" aria-labelledby="security-heading">
  <div
    class="mx-auto flex flex-wrap items-start gap-12 px-6 py-18 max-inline-page"
  >
    <div class="flex grow-999 basis-130 flex-col gap-7 min-inline-0">
      <h2 id="security-heading" class="m-0 font-display text-heading font-bold">
        Security
      </h2>
      <p class="m-0 text-lead max-inline-prose">
        Omnileaf opens comic and book archives such as CBZ and CB7 files, with
        CBR (RAR) support in development. These files can come from untrusted
        sources, so we treat archive parsing and extraction as a
        security-sensitive area and test it accordingly.
      </p>
      <div class="flex flex-col gap-3">
        <h3 class="m-0 text-lead font-semibold">Our focus</h3>
        <ul class="m-0 flex list-disc flex-col gap-2 ps-5.5 text-muted">
          <li>
            Fuzzing and code review of archive parsing and extraction paths
          </li>
          <li>
            Vulnerability identification and patch validation across our own
            codebase
          </li>
          <li>Tracking and updating the open source libraries we depend on</li>
        </ul>
      </div>
      <div class="flex flex-col gap-3">
        <h3 class="m-0 text-lead font-semibold">Reporting a vulnerability</h3>
        <p class="m-0 text-muted max-inline-prose">
          Email <a href={mailto} class="font-semibold text-accent-ink"
            >{SECURITY_EMAIL}</a
          > with details and steps to reproduce. We acknowledge reports within 3 business
          days and follow coordinated disclosure. Please give us a reasonable chance
          to fix an issue before publishing it, and avoid accessing data that is not
          your own.
        </p>
      </div>
    </div>
    <aside
      aria-label="Security contact"
      class="flex grow basis-75 flex-col gap-5 rounded-aside border border-border bg-card p-7 min-inline-0"
    >
      <div class="flex flex-col gap-1">
        <span
          class="text-label font-semibold tracking-wide text-muted uppercase"
          >Security lead</span
        >
        <span class="font-display text-title font-bold">Kaiser Bh</span>
        <span class="text-muted">Security Lead, Omnileaf Pty Ltd</span>
      </div>
      <div class="bg-border block-px"></div>
      <div class="flex flex-col gap-1">
        <span
          class="text-label font-semibold tracking-wide text-muted uppercase"
          >Contact</span
        >
        <a
          href={mailto}
          class="text-lead font-semibold wrap-anywhere text-accent-ink"
          >{SECURITY_EMAIL}</a
        >
      </div>
      <a
        href={securityTxtUrl}
        class="inline-flex items-center justify-center rounded-control border border-border font-mono text-small font-medium text-foreground no-underline min-block-11"
        >{securityTxtUrl}</a
      >
    </aside>
  </div>
</section>
