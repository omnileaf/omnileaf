import { createContext } from "svelte";

export type AlertTone = "plain" | "warning";

export const ALERT_TONES = {
  plain: {
    alert:
      "border-border bg-card text-foreground windows:bg-native-info-bar windows:text-native-on-info-bar",
    icon: "text-accent windows:text-native-info-bar-icon",
    description: "text-muted windows:text-native-on-info-bar",
    strongAction: "bg-foreground text-card",
  },
  warning: {
    alert:
      "border-warning-edge bg-warning-soft text-on-warning windows:bg-native-info-bar-warning windows:text-native-on-info-bar",
    icon: "text-on-warning windows:text-native-info-bar-warning-icon",
    description: "text-on-warning windows:text-native-on-info-bar",
    strongAction: "bg-on-warning text-warning-soft",
  },
} satisfies Record<
  AlertTone,
  { alert: string; icon: string; description: string; strongAction: string }
>;

export const [getAlertTone, setAlertTone] = createContext<() => AlertTone>();
