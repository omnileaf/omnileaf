const LAYER =
  "isolate relative flex shrink-0 items-center justify-center rounded-native-button text-native-on-button-plain transition-control before:pointer-events-none before:absolute before:inset-x-2xs before:inset-y-icon-gap before:z-behind before:rounded-native-button before:transition-control hover:before:bg-native-button-plain-hover focus-visible:focus-ring focus-visible:ring-1 focus-visible:ring-native-focus-ring-inner active:before:bg-native-button-plain-pressed active:text-native-on-button-pressed aria-disabled:text-native-on-button-disabled aria-disabled:hover:before:bg-transparent forced-colors:hover:before:outline forced-colors:hover:before:outline-native-menu-edge";

const TOGGLED =
  "aria-pressed:text-native-on-button-primary aria-pressed:before:bg-native-button-primary aria-pressed:hover:before:bg-native-button-primary-hover aria-pressed:active:before:bg-native-button-primary-pressed aria-pressed:active:text-native-on-button-primary";

export const WINDOWS_ICON_SIZE = 20;

export const WINDOWS_BACK_KEYS = "Escape Alt+ArrowLeft";

export const WINDOWS_TOGGLED_ON =
  "text-native-on-button-primary before:bg-native-button-primary";

export const WINDOWS_BAR =
  "flex items-center gap-2xs border-be border-native-menu-edge bg-native-menu px-xs text-native-on-menu backdrop-blur-menu min-block-native-command-button-block max-medium:min-block-native-command-bar";

export const WINDOWS_BOTTOM_BAR =
  "flex flex-col gap-xs border-bs border-native-menu-edge bg-native-menu px-lg py-sm text-native-on-menu backdrop-blur-menu";

export const WINDOWS_FLYOUT =
  "rounded-native-menu border border-native-menu-edge bg-native-menu text-native-on-menu shadow-native-menu-lift backdrop-blur-menu";

export const WINDOWS_ICON_BUTTON = `${LAYER} inline-native-command-bar block-native-command-bar`;

export const WINDOWS_COMMAND_BUTTON = `${LAYER} ${TOGGLED} flex-col gap-xs px-2xs text-caption inline-native-command-button block-native-command-button-block max-medium:inline-native-command-bar max-medium:block-native-command-bar`;

export const WINDOWS_COMMAND_LABEL =
  "text-center text-caption text-balance max-medium:sr-only";

export const WINDOWS_SEPARATOR =
  "mx-sm hidden shrink-0 border-s border-native-menu-rule block-xl large:block";
