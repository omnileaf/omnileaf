import { createContext } from "svelte";

export type AlertTone = "plain" | "warning";

export const ALERT_TONES = {
  plain: {
    alert: "border-border bg-card text-foreground",
    icon: "text-accent",
    strongAction: "bg-foreground text-card",
  },
  warning: {
    alert: "border-warning-edge bg-warning-soft text-on-warning",
    icon: "text-warning-strong",
    strongAction: "bg-on-warning text-warning-soft",
  },
} satisfies Record<
  AlertTone,
  { alert: string; icon: string; strongAction: string }
>;

export const [getAlertTone, setAlertTone] = createContext<() => AlertTone>();
