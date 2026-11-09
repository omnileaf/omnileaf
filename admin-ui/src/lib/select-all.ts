export interface SelectableText {
  readonly value: string;
  focus(): void;
  select(): void;
  setSelectionRange(start: number, end: number): void;
}

/** iOS Safari ignores `select()` on a textarea unless the selection range is set as well. */
export function selectAll(area: SelectableText | null): void {
  if (area === null) {
    return;
  }
  area.focus();
  area.select();
  area.setSelectionRange(0, area.value.length);
}
