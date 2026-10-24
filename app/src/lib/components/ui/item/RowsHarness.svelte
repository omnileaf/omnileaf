<script lang="ts">
  import {
    Item,
    ItemChevron,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
  } from "./index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
</script>

<ul class="row-rules" aria-label="Rows">
  <li>
    <Item look="row" aria-label="One line">
      <ItemContent>
        <ItemTitle>Reading</ItemTitle>
      </ItemContent>
      <ItemChevron />
    </Item>
  </li>
  <li>
    <Item look="row" aria-label="Two lines">
      <ItemContent>
        <ItemTitle>Storage</ItemTitle>
        <ItemDescription>2.1 GB used</ItemDescription>
      </ItemContent>
    </Item>
  </li>
</ul>

<ul class="row-rules" aria-label="Rows with icons">
  <li>
    <Item look="row" aria-label="First with icon">
      <ItemMedia><Icon name="chevron-right" /></ItemMedia>
      <ItemContent><ItemTitle>Library</ItemTitle></ItemContent>
    </Item>
  </li>
  <li>
    <Item look="row" aria-label="Second with icon">
      <ItemMedia><Icon name="chevron-right" /></ItemMedia>
      <ItemContent><ItemTitle>Reading</ItemTitle></ItemContent>
    </Item>
  </li>
</ul>

<ul aria-label="Picked rows">
  <li>
    <Item look="row" aria-label="Picked row" data-picked>
      <ItemContent>
        <ItemTitle>Volume 3</ItemTitle>
        <ItemDescription>Page 14 of 192</ItemDescription>
      </ItemContent>
    </Item>
  </li>
</ul>

<ul aria-label="Pressable rows">
  <li>
    <Item look="row">
      {#snippet child({ props })}
        <button type="button" aria-label="Button row" {...props}>
          <ItemContent><ItemTitle>Clear cache</ItemTitle></ItemContent>
        </button>
      {/snippet}
    </Item>
  </li>
</ul>
