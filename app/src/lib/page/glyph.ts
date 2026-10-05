import type { Component } from "svelte";
import type { ClassValue } from "svelte/elements";

export type Glyph = Component<{ size: number; class?: ClassValue }>;
