<script lang="ts">
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";
  import { reportFileFailure } from "#lib/drop/drop-notices.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { openHandedFiles } from "./open-handed-files.ts";

  const notices = getNotices();

  onMount(() =>
    openHandedFiles(
      (page) => void goto(page),
      (error) => {
        reportFileFailure(notices, error, reportError);
      },
    ),
  );
</script>
