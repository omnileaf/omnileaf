import type { HandleClientError } from "@sveltejs/kit";

import { announceInterfaceError } from "$lib/crash-report/interface-errors";

const FIRST_SERVER_ERROR_STATUS = 500;

export const handleError: HandleClientError = ({ error, status }) => {
  if (status >= FIRST_SERVER_ERROR_STATUS) {
    announceInterfaceError(window, error);
  }
};
