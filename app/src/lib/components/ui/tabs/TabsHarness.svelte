<script lang="ts">
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "./index.ts";

  let chosen = $state("volumes");
</script>

<Tabs bind:value={chosen}>
  <TabsList aria-label="Kinds of book">
    <TabsTrigger value="volumes" data-label="Volumes">Volumes</TabsTrigger>
    <TabsTrigger value="chapters" data-label="Chapters">Chapters</TabsTrigger>
    <TabsTrigger value="specials" data-label="Specials">Specials</TabsTrigger>
  </TabsList>
  <TabsContent value={chosen}>{chosen}</TabsContent>
</Tabs>
