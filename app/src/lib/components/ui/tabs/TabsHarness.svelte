<script lang="ts">
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "./index.ts";

  let { hasTurnedOffTab = false }: { hasTurnedOffTab?: boolean } = $props();

  let chosen = $state("volumes");
</script>

<Tabs bind:value={chosen}>
  <TabsList aria-label="Kinds of book">
    <TabsTrigger value="volumes" data-label="Volumes">Volumes</TabsTrigger>
    <TabsTrigger value="chapters" data-label="Chapters">Chapters</TabsTrigger>
    <TabsTrigger value="specials" data-label="Specials">Specials</TabsTrigger>
    {#if hasTurnedOffTab}
      <TabsTrigger value="extras" data-label="Extras" disabled
        >Extras</TabsTrigger
      >
    {/if}
  </TabsList>
  <TabsContent value={chosen}>{chosen}</TabsContent>
</Tabs>
