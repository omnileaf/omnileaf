import type { ClientInit, HandleClientError } from "@sveltejs/kit";

import { appInterfaceErrors } from "#lib/crash-report/interface-error-relay.ts";
import {
  announceInterfaceError,
  listenForInterfaceErrors,
} from "#lib/crash-report/interface-errors.ts";

const FIRST_SERVER_ERROR_STATUS = 500;

export const init: ClientInit = () => {
  listenForInterfaceErrors(window, appInterfaceErrors.hear);
};

export const handleError: HandleClientError = ({ error, status }) => {
  if (status >= FIRST_SERVER_ERROR_STATUS) {
    announceInterfaceError(window, error);
  }
};
