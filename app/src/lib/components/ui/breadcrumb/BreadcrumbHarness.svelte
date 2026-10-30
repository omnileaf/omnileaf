<script lang="ts">
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "./index.ts";
</script>

<Breadcrumb aria-label="Where this series sits">
  <BreadcrumbItem>
    <a href="#comics">Comics</a>
  </BreadcrumbItem>
  <BreadcrumbSeparator />
  <BreadcrumbItem>
    <BreadcrumbPage>Sample Series 04</BreadcrumbPage>
  </BreadcrumbItem>
</Breadcrumb>
