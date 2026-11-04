<script lang="ts">
  import { resolve } from "$app/paths";

  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "#lib/components/ui/breadcrumb/index.ts";
  import { copy } from "#lib/copy.ts";
  import { pathSegment } from "#lib/path-segment.ts";

  let { code }: { code: string } = $props();
</script>

<Breadcrumb class="mbe-3">
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href={resolve("/reports")}>
        {copy.shell.reports}
      </BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbLink
        href={resolve("/reports/[code]", { code: pathSegment(code) })}
        class="font-mono"
      >
        {code}
      </BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>{copy.issue.crumb}</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
