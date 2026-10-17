import type { Plugin } from "vite";

import {
  SAMPLE_ART_BASE,
  sampleArt,
} from "../src/lib/sample-library/sample-art.ts";

const PROTOCOL = "omni/";
const NOT_FOUND = 404;

/** Serves the sample library's covers and pages while developing, never in a build. */
export function sampleLibraryArt(): Plugin {
  return {
    name: "omnileaf-sample-library-art",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(SAMPLE_ART_BASE, (request, response) => {
        const path = decodeURIComponent(
          (request.url ?? "")
            .replace(/^\//, "")
            .replace(PROTOCOL, "")
            .split("?")[0] ?? "",
        );
        const art = sampleArt(path);
        if (art === undefined) {
          response.statusCode = NOT_FOUND;
          response.end();
          return;
        }
        response.setHeader("Content-Type", "image/svg+xml");
        response.setHeader("Cache-Control", "no-store");
        response.end(art);
      });
    },
  };
}
