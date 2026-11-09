<script lang="ts">
  import { CircleAlert } from "@lucide/svelte";

  import {
    Alert,
    AlertActions,
    AlertButton,
    AlertDescription,
    AlertDismiss,
    AlertTitle,
    type AlertTone,
  } from "./index.ts";

  let {
    tone,
    onDismiss,
    dismissible = true,
  }: {
    tone: AlertTone;
    onDismiss: () => void;
    dismissible?: boolean;
  } = $props();
</script>

<Alert {tone} icon={CircleAlert} iconName="circle-alert">
  <AlertTitle>Sample Comics looks empty</AlertTitle>
  {#if dismissible}
    <AlertDismiss label="Dismiss" {onDismiss} />
  {/if}
  <AlertDescription>Nothing in your library changed.</AlertDescription>
  <AlertActions>
    <AlertButton emphasis="strong">Remove its books</AlertButton>
  </AlertActions>
</Alert>
