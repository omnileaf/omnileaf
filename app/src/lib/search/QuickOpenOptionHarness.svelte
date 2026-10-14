<script lang="ts">
  import { Command } from "bits-ui";

  import { choiceKey, type Choice } from "./quick-open-choice";
  import QuickOpenOption from "./QuickOpenOption.svelte";

  let {
    id,
    choice,
    isActive,
    usesStandIns,
    onChoose,
  }: {
    id: string;
    choice: Choice;
    isActive: boolean;
    usesStandIns: boolean;
    onChoose: () => void;
  } = $props();
</script>

<Command.Root shouldFilter={false} value={isActive ? choiceKey(choice) : ""}>
  <Command.List aria-label="Options">
    <Command.Viewport>
      <QuickOpenOption {id} {choice} {isActive} {usesStandIns} {onChoose} />
    </Command.Viewport>
  </Command.List>
</Command.Root>
