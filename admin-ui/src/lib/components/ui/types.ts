import type { Component } from "svelte";

export type WithElementRef<T, E extends HTMLElement = HTMLElement> = Omit<
  T,
  "style"
> & {
  ref?: E | null;
};

export type IconComponent = Component<{ class?: string }>;
