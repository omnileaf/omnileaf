export const CHOICE_ROW = {
  section:
    "grid grid-cols-setup-choice-narrow items-center gap-x-lg rounded-windows-control border border-windows-stroke bg-native-card p-lg medium:grid-cols-setup-choice",
  icon: "col-start-1 row-start-1 flex items-center self-center text-foreground",
  title: "col-start-2 row-start-1 text-label",
  hint: "col-start-2 row-start-2 text-caption text-muted",
  control:
    "col-span-2 col-start-1 row-start-3 max-medium:mbs-md medium:col-span-1 medium:col-start-3 medium:row-span-2 medium:row-start-1",
  controlAlone:
    "col-span-2 col-start-1 row-start-2 max-medium:mbs-md medium:col-span-1 medium:col-start-3 medium:row-start-1",
} as const;
