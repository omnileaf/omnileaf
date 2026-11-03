import { writeFile } from "node:fs/promises";

import settings from "../project.inlang/settings.json" with { type: "json" };
import { renderLocalesConfig } from "./locales-config.ts";

const LOCALES_CONFIG = new URL(
  "../src-tauri/gen/android/app/src/main/res/xml/locales_config.xml",
  import.meta.url,
);

await writeFile(LOCALES_CONFIG, renderLocalesConfig(settings.locales));
