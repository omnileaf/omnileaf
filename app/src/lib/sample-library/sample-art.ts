/** Where the development server serves the sample library's art, as the base of its fake protocols. */
export const SAMPLE_ART_BASE = "/__sample-library__/";

const ART_COLOURS: Readonly<Record<string, string>> = {
  "1": "oklch(0.646 0.222 41.116)",
  "2": "oklch(0.6 0.118 184.704)",
  "3": "oklch(0.398 0.07 227.392)",
  "4": "oklch(0.828 0.189 84.429)",
  "5": "oklch(0.769 0.188 70.08)",
};
const FALLBACK_COLOUR = "oklch(0.556 0 0)";
const COVER = /^covers\/\d+-(\d)(?:-\d+)?$/;
const PAGE = /^(?:thumbnails\/)?pages\/\d+-(\d)-\d+-(\d+)$/;
const STRIP = /^(?:thumbnails\/)?strips\/\d+-(\d)-\d+-(\d+)$/;

function colourOf(art: string | undefined): string {
  return (art === undefined ? undefined : ART_COLOURS[art]) ?? FALLBACK_COLOUR;
}

function cover(colour: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="400" height="600">
<rect width="400" height="600" fill="${colour}"/>
<circle cx="330" cy="210" r="150" fill="${colour}"/>
<circle cx="330" cy="210" r="150" fill="oklch(0 0 0 / 0.22)"/>
<rect x="40" y="470" width="190" height="34" rx="6" fill="oklch(1 0 0 / 0.72)"/>
</svg>`;
}

function page(colour: string, number: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1500" width="1000" height="1500">
<rect width="1000" height="1500" fill="oklch(0.985 0 0)"/>
<rect x="60" y="60" width="880" height="560" rx="8" fill="${colour}" fill-opacity="0.35"/>
<rect x="60" y="660" width="420" height="420" rx="8" fill="oklch(0.88 0 0)"/>
<rect x="520" y="660" width="420" height="420" rx="8" fill="${colour}" fill-opacity="0.2"/>
<rect x="60" y="1120" width="880" height="320" rx="8" fill="oklch(0.92 0 0)"/>
<text x="500" y="1330" font-family="system-ui, sans-serif" font-size="160" font-weight="700" text-anchor="middle" fill="oklch(0.3 0 0)">${number}</text>
</svg>`;
}

function strip(colour: string, number: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 2400" width="800" height="2400">
<rect width="800" height="2400" fill="oklch(0.985 0 0)"/>
<rect x="40" y="80" width="720" height="900" rx="8" fill="${colour}" fill-opacity="0.35"/>
<circle cx="400" cy="560" r="220" fill="${colour}" fill-opacity="0.45"/>
<rect x="200" y="1120" width="560" height="520" rx="8" fill="oklch(0.88 0 0)"/>
<rect x="40" y="1780" width="720" height="540" rx="8" fill="${colour}" fill-opacity="0.2"/>
<text x="400" y="2120" font-family="system-ui, sans-serif" font-size="140" font-weight="700" text-anchor="middle" fill="oklch(0.3 0 0)">${number}</text>
</svg>`;
}

/** Draws the sample library's covers and pages as SVG, in the colours the boards give their sample covers. */
export function sampleArt(path: string): string | undefined {
  const coverMatch = COVER.exec(path);
  if (coverMatch !== null) {
    return cover(colourOf(coverMatch[1]));
  }
  const stripMatch = STRIP.exec(path);
  if (stripMatch !== null) {
    return strip(colourOf(stripMatch[1]), stripMatch[2] ?? "");
  }
  const pageMatch = PAGE.exec(path);
  if (pageMatch !== null) {
    return page(colourOf(pageMatch[1]), pageMatch[2] ?? "");
  }
  return undefined;
}
