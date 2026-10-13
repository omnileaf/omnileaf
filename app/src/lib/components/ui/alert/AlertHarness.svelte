<script lang="ts">
  import { CircleAlert } from "@lucide/svelte";

  import {
    Alert,
    AlertActions,
    AlertButton,
    AlertDismiss,
    AlertTitle,
    type AlertTone,
  } from "./index.ts";

  let { tone, onDismiss }: { tone: AlertTone; onDismiss: () => void } =
    $props();
</script>

<Alert {tone} icon={CircleAlert}>
  <AlertTitle>Sample Comics looks empty</AlertTitle>
  <AlertDismiss label="Dismiss" {onDismiss} />
  <AlertActions>
    <AlertButton emphasis="strong">Remove its books</AlertButton>
  </AlertActions>
</Alert>
