import type { ClientInit, HandleClientError } from "@sveltejs/kit/hooks";

import { appInterfaceErrors } from "#lib/crash-report/interface-error-relay.ts";
import {
  announceInterfaceError,
  listenForInterfaceErrors,
} from "#lib/crash-report/interface-errors.ts";

export const init: ClientInit = async () => {
  if (import.meta.env.DEV && import.meta.env.VITE_SAMPLE_LIBRARY === "on") {
    const { installSampleLibrary } =
      await import("#lib/sample-library/install-sample-library.ts");
    installSampleLibrary(window);
  }
  listenForInterfaceErrors(window, appInterfaceErrors.hear);
};

export const handleError: HandleClientError = ({ kind, error }) => {
  if (kind === "unknown") {
    announceInterfaceError(window, error);
  }
};
