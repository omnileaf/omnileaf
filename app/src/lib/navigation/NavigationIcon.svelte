<!--
  The book-open, compass, rotate-ccw-clock and settings shapes are adapted from Lucide.

  ISC License

  Copyright (c) 2026 Lucide Icons and Contributors

  Permission to use, copy, modify, and/or distribute this software for any
  purpose with or without fee is hereby granted, provided that the above
  copyright notice and this permission notice appear in all copies.

  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
  WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
  MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
  ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
  WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
  ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
  OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

  The compass shape is derived from the Feather project:

  The MIT License (MIT)

  Copyright (c) 2013-present Cole Bemis

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  import type { Section } from "./sections";

  let {
    section,
    isSelected,
    size,
  }: { section: Section; isSelected: boolean; size: number } = $props();

  const HOLE = "stroke-accent-soft";

  const SHAPES: Record<Section, Snippet<[boolean]>> = {
    library,
    browse,
    history,
    settings,
  };

  const shape = $derived(SHAPES[section]);
</script>

{#snippet library(filled: boolean)}
  <path
    d="M12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4a5 5 0 0 1 4 2z"
    fill={filled ? "currentColor" : "none"}
  />
  <path
    d="M12 5a5 5 0 0 1 4-2h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4a5 5 0 0 0-4 2z"
    fill={filled ? "currentColor" : "none"}
  />
  {#if filled}
    <path d="M12 6v14" class={HOLE} stroke-width="1.6" />
  {/if}
{/snippet}

{#snippet browse(filled: boolean)}
  <circle cx="12" cy="12" r="10" fill={filled ? "currentColor" : "none"} />
  <path
    d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"
    class={[filled && [HOLE, "fill-accent-soft"]]}
  />
{/snippet}

{#snippet history(filled: boolean)}
  <path d="M3 3v5h5" />
  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
  {#if filled}
    <circle cx="12" cy="12" r="6.4" fill="currentColor" stroke="none" />
  {/if}
  <path d="M12 7v5l4 2" class={[filled && HOLE]} />
{/snippet}

{#snippet settings(filled: boolean)}
  <path
    d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
    fill={filled ? "currentColor" : "none"}
  />
  <circle cx="12" cy="12" r="3" class={[filled && HOLE]} />
{/snippet}

<svg
  aria-hidden="true"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {@render shape(isSelected)}
</svg>
