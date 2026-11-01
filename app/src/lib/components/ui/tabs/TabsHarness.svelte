<script lang="ts">
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "./index.ts";

  let {
    hasTurnedOffTab = false,
    names = ["Volumes", "Chapters", "Specials"],
  }: {
    hasTurnedOffTab?: boolean;
    names?: readonly [string, string, string];
  } = $props();

  const [volumes, chapters, specials] = $derived(names);
  let chosen = $state("volumes");
</script>

<Tabs bind:value={chosen}>
  <TabsList aria-label="Kinds of book">
    <TabsTrigger value="volumes" data-label={volumes}>{volumes}</TabsTrigger>
    <TabsTrigger value="chapters" data-label={chapters}>{chapters}</TabsTrigger>
    <TabsTrigger value="specials" data-label={specials}>{specials}</TabsTrigger>
    {#if hasTurnedOffTab}
      <TabsTrigger value="extras" data-label="Extras" disabled
        >Extras</TabsTrigger
      >
    {/if}
  </TabsList>
  <TabsContent value={chosen}>{chosen}</TabsContent>
</Tabs>
