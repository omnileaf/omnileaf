<script lang="ts">
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";
  import { reportFileFailure } from "#lib/drop/drop-notices.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { openHandedDocuments } from "./open-handed-documents.ts";
  import { openHandedFiles } from "./open-handed-files.ts";
  import OpeningDocumentToast from "./OpeningDocumentToast.svelte";

  const notices = getNotices();

  function reportFailure(error: unknown): void {
    reportFileFailure(notices, error, reportError);
  }

  onMount(() => {
    const stopOpeningFiles = openHandedFiles(
      (page) => void goto(page),
      reportFailure,
    );
    openHandedDocuments(
      () =>
        notices.present(OpeningDocumentToast, (toast) => ({ toast }), "polite")
          .dismiss,
      reportFailure,
    );
    return stopOpeningFiles;
  });
</script>
