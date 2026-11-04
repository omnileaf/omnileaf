<script lang="ts">
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";

  import { resolve } from "$app/paths";

  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
  } from "#lib/components/ui/breadcrumb/index.ts";
  import { copy } from "#lib/copy.ts";
</script>

<Breadcrumb class="mbe-3">
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href={resolve("/reports")} class="gap-1">
        <ChevronLeft class="block-3.5 inline-3.5 rtl:rotate-180" />
        {copy.report.backToReports}
      </BreadcrumbLink>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
