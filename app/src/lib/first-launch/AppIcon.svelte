<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  let { class: className }: { class?: ClassValue } = $props();

  const veinId = $props.id();
</script>

<svg
  aria-hidden="true"
  viewBox="0 0 1024 1024"
  xmlns="http://www.w3.org/2000/svg"
  class={className}
>
  <rect width="1024" height="1024" rx="224" fill="#2f6f4f" />
  <mask id={veinId}>
    <rect width="1024" height="1024" fill="#fff" />
    <path
      d="M642 714 L 754 410"
      stroke="#000"
      stroke-width="30"
      stroke-linecap="round"
    />
  </mask>
  <g transform="translate(0 -18)">
    <g
      fill="none"
      stroke="#fff"
      stroke-width="64"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M248 770 L 776 770" />
      <rect x="292" y="370" width="104" height="400" rx="20" />
      <rect x="436" y="290" width="116" height="480" rx="20" />
      <path d="M436 400 L 552 400" />
    </g>
    <path
      d="M610 770 C 578 580, 642 390, 790 290 C 828 490, 778 660, 610 770 Z"
      fill="#fff"
      mask="url(#{veinId})"
    />
  </g>
</svg>
