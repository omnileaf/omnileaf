import { isRecord, listOf } from "./json.ts";
import type { Session } from "./webdriver.ts";
import { pollUntil } from "./webdriver.ts";

const APP_WEBVIEW = "WEBVIEW_app.omnileaf";
const RESTART_TIMEOUT_MS = 60_000;

async function hasAppPage(session: Session): Promise<true | undefined> {
  const webviews = listOf(await session.runMobileCommand("getContexts", {}));
  const shown = webviews.some(
    (webview) =>
      isRecord(webview) &&
      webview.webviewName === APP_WEBVIEW &&
      listOf(webview.pages).length > 0,
  );
  return shown ? true : undefined;
}

/** Going back to the web view from the native context makes the driver attach to the new process, since the old one's page is gone. */
export async function followRestartedApp(session: Session): Promise<void> {
  await session.inNativeContext(() =>
    pollUntil(
      () => hasAppPage(session),
      RESTART_TIMEOUT_MS,
      "the restarted app's web view",
    ),
  );
}
