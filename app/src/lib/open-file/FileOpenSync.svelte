<script lang="ts">
  import { onMount } from "svelte";

  import { goto } from "$app/navigation";
  import { reportFileFailure } from "#lib/drop/drop-notices.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { openHandedDocuments } from "./open-handed-documents.ts";
  import { openHandedFiles } from "./open-handed-files.ts";
  import OpeningDocumentToast from "./OpeningDocumentToast.svelte";
  import UnsupportedFileDialog from "./UnsupportedFileDialog.svelte";

  const notices = getNotices();

  let isUnsupportedShown = $state(false);

  function reportFailure(error: unknown): void {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "bookTypeUnsupported"
    ) {
      isUnsupportedShown = true;
      return;
    }
    reportFileFailure(notices, error, reportError);
  }

  onMount(() => {
    const stopOpeningFiles = openHandedFiles(
      (page) => void goto(page),
      reportFailure,
    );
    const stopOpeningDocuments = openHandedDocuments(
      () =>
        notices.present(OpeningDocumentToast, (toast) => ({ toast }), "polite")
          .dismiss,
      reportFailure,
    );
    return () => {
      stopOpeningFiles();
      stopOpeningDocuments();
    };
  });
</script>

<UnsupportedFileDialog
  isOpen={isUnsupportedShown}
  onClose={() => {
    isUnsupportedShown = false;
  }}
/>
