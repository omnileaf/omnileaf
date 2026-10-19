import { type FakeIpc, installFakeIpc } from "#lib/ipc/fake-ipc.ts";

import { SAMPLE_ART_BASE } from "./sample-art.ts";
import { sampleBackend, scenarioFrom } from "./sample-backend.ts";

const REMEMBERED_SCENARIO = "omnileaf.sampleScenario";

/** The scenario asked for in the address, else the one asked for earlier in this tab, since the app's own navigation drops the address's query. */
function askedScenario(target: Window): URLSearchParams {
  const asked = target.location.search;
  try {
    if (asked !== "") {
      target.sessionStorage.setItem(REMEMBERED_SCENARIO, asked);
      return new URLSearchParams(asked);
    }
    return new URLSearchParams(
      target.sessionStorage.getItem(REMEMBERED_SCENARIO) ?? "",
    );
  } catch {
    return new URLSearchParams(asked);
  }
}

export function installSampleLibrary(target: Window): void {
  const installed: FakeIpc[] = [];
  const backend = sampleBackend(scenarioFrom(askedScenario(target)), {
    emit: (event, payload) => {
      for (const ipc of installed) {
        ipc.emit(event, payload);
      }
    },
  });
  installed.push(installFakeIpc(target, backend, SAMPLE_ART_BASE));
}
