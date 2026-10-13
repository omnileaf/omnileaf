const CONFIRM =
  "rounded-full px-lg text-body font-semibold transition-control min-block-touch-button focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ios:max-medium:rounded-ios-button medium:rounded-button medium:text-label medium:min-block-pointer-target";

const ABOUT_COPY =
  "inline-flex items-center gap-sm text-start text-callout font-semibold min-block-touch-target min-inline-none";

export const BUTTON_LOOKS = {
  text: "font-semibold text-accent",
  quiet:
    "font-semibold text-accent transition-control enabled:hover:bg-hover enabled:active:bg-pressed",
  filled: "bg-accent text-on-accent",
  outline: "rounded-control border border-border bg-card font-semibold",
  icon: "flex items-center justify-center rounded-full",
  "header-control":
    "flex items-center justify-center gap-sm rounded-full transition-control large:rounded-control large:border large:border-field large:text-small large:font-medium",
  "about-copy-phone": `${ABOUT_COPY} rounded-tile px-md text-accent transition-control hover:bg-hover active:bg-pressed`,
  "about-copy-pane": `${ABOUT_COPY} rounded-control border border-border bg-card ps-md pe-list-row hover:tint-hover active:tint-pressed desktop:text-label desktop:min-block-pointer-button`,
  "confirm-cancel": `${CONFIRM} bg-chip hover:tint-hover active:tint-pressed medium:border medium:border-border medium:bg-card`,
  "confirm-danger": `${CONFIRM} bg-danger text-on-danger hover:bg-danger-hover active:bg-danger-pressed`,
  "crash-phone-primary":
    "rounded-full bg-accent text-callout font-bold text-on-accent min-block-crash-screen-button ios:rounded-crash-screen-button",
  "crash-phone-secondary":
    "rounded-full border border-quiet-edge text-callout font-bold min-block-crash-screen-button ios:rounded-crash-screen-button",
  "crash-dialog-copy":
    "rounded-dialog-button px-md text-label font-semibold text-accent min-block-dialog-button touch:min-block-touch-target",
  "crash-dialog-secondary":
    "rounded-dialog-button border border-border px-lg text-label font-semibold min-block-dialog-button touch:min-block-touch-target",
  "crash-dialog-primary":
    "rounded-dialog-button bg-accent px-lg text-label font-semibold text-on-accent min-block-dialog-button touch:min-block-touch-target",
} satisfies Record<string, string>;

export type ButtonLook = keyof typeof BUTTON_LOOKS;
