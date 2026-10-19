import type { Page } from "@playwright/test";

const NAMED_TAG_LENGTH = 100;
const NAMED_LABEL_LENGTH = 40;
const CULPRITS_NAMED = 3;
const SUBPIXEL = 0.5;
const SCROLL_WIDTH_ROUNDING = 1;

export function sidewaysOverflow(
  page: Page,
  within = "main",
): Promise<string[]> {
  return page.evaluate(
    ([
      scope,
      tagLength,
      labelLength,
      culpritsNamed,
      subpixel,
      scrollWidthRounding,
    ]) => {
      type Side = "left" | "right";
      interface Area {
        readonly start: number;
        readonly end: number;
      }
      interface Placed {
        readonly element: Element;
        readonly left: number;
        readonly right: number;
        readonly from: Element | null;
        readonly bleed: Readonly<Record<Side, number>>;
      }
      type Piece = Placed &
        (
          | { readonly part: "box" | "::before" | "::after" }
          | { readonly part: "text"; readonly text: Text }
        );
      interface Reach {
        readonly piece: Piece;
        readonly side: Side;
        readonly past: number;
      }
      interface Reaches {
        readonly boxes: Map<Element, Reach[]>;
        readonly window: Reach[];
      }
      interface Line {
        readonly box: Element;
        readonly spills: boolean;
        readonly report: string;
        readonly culprits: readonly Piece[];
      }
      const SIDES: readonly Side[] = ["left", "right"];
      const PSEUDOS = ["::before", "::after"] as const;
      const CONTAINING_PROPERTIES = [
        "transform",
        "translate",
        "rotate",
        "scale",
        "perspective",
        "filter",
        "backdrop-filter",
      ];
      const CONTAINMENTS = ["paint", "layout", "strict", "content"];
      const SCROLLING = ["auto", "scroll"];
      const IN_FLOW = ["static", "relative", "sticky"];
      const CUT_VERBS = new Map([
        ["visible", "spills"],
        ["clip", "clips"],
        ["hidden", "hides"],
      ]);
      const NO_BLEED = { left: 0, right: 0 };
      const FILLED_ROLES = "[role=progressbar], [role=meter]";
      const root = document.documentElement;
      const windowArea: Area = { start: 0, end: root.clientWidth };
      const documentOrder = new Map(
        [...document.querySelectorAll("*")].map((element, index) => [
          element,
          index,
        ]),
      );

      const memoized = <T>(
        compute: (element: Element) => T,
      ): ((element: Element) => T) => {
        const known = new Map<Element, T>();
        return (element) => {
          const remembered = known.get(element);
          if (remembered !== undefined) {
            return remembered;
          }
          const computed = compute(element);
          known.set(element, computed);
          return computed;
        };
      };
      const styleOf = memoized((element) => getComputedStyle(element));
      const rectOf = memoized((element) => element.getBoundingClientRect());
      const pixelsOf = (length: string): number => {
        const pixels = Number.parseFloat(length);
        return Number.isNaN(pixels) ? 0 : pixels;
      };
      const isWindow = (block: Element): boolean =>
        block === root || block === document.body;
      const isSet = (value: string): boolean =>
        value !== "" && value !== "none";

      const establishesFixedContainingBlock = memoized((element) => {
        const style = styleOf(element);
        const willChange = style.willChange
          .split(",")
          .map((name) => name.trim());
        return (
          CONTAINING_PROPERTIES.some(
            (name) =>
              isSet(style.getPropertyValue(name)) || willChange.includes(name),
          ) || CONTAINMENTS.some((kind) => style.contain.includes(kind))
        );
      });
      const establishesAbsoluteContainingBlock = (element: Element): boolean =>
        styleOf(element).position !== "static" ||
        establishesFixedContainingBlock(element);
      const nearestAncestor = (
        element: Element,
        isBlock: (ancestor: Element) => boolean,
      ): Element | null => {
        let ancestor = element.parentElement;
        while (ancestor !== null && !isBlock(ancestor)) {
          ancestor = ancestor.parentElement;
        }
        return ancestor;
      };
      const containingBlockOf = memoized((element): Element | null => {
        const { position } = styleOf(element);
        if (position === "fixed") {
          return nearestAncestor(element, establishesFixedContainingBlock);
        }
        return position === "absolute"
          ? (nearestAncestor(element, establishesAbsoluteContainingBlock) ??
              root)
          : element.parentElement;
      });
      const ownBoxOf = (element: Element): Area => {
        const { left, right } = rectOf(element);
        return { start: left, end: right };
      };
      const areaOf = memoized((block): Area => {
        const start = rectOf(block).left + block.clientLeft;
        return { start, end: start + block.clientWidth };
      });

      const clipsToAPixel = (element: Element): boolean => {
        const style = styleOf(element);
        const { width, height } = rectOf(element);
        const clipsItsContent =
          style.overflowX !== "visible" ||
          style.overflowY !== "visible" ||
          isSet(style.clipPath) ||
          !["", "auto"].includes(style.getPropertyValue("clip"));
        return (
          style.display !== "contents" &&
          clipsItsContent &&
          (width <= 1 || height <= 1)
        );
      };
      const isClippedAway = (element: Element): boolean => {
        for (
          let clipping: Element | null = element;
          clipping !== null;
          clipping = clipping.parentElement
        ) {
          if (clipsToAPixel(clipping)) {
            return true;
          }
        }
        return false;
      };
      const isHiddenFromPeople = memoized(
        (element) =>
          element.closest("[aria-hidden=true], [inert]") !== null ||
          !element.checkVisibility({ visibilityProperty: true }) ||
          isClippedAway(element),
      );
      const isInsideAnSvg = (element: Element): boolean =>
        element instanceof SVGElement && element.ownerSVGElement !== null;

      const shiftOf = (style: CSSStyleDeclaration, width: number): number => {
        const transformed =
          style.transform === "none"
            ? 0
            : new DOMMatrixReadOnly(style.transform).m41;
        const [along = "0px"] = isSet(style.translate)
          ? style.translate.split(" ")
          : [];
        const translated = Number.parseFloat(along);
        return (
          transformed +
          (along.endsWith("%") ? (translated / 100) * width : translated)
        );
      };
      const startOf = (
        style: CSSStyleDeclaration,
        area: Area,
        width: number,
      ): number => {
        if (style.left !== "auto") {
          return area.start + Number.parseFloat(style.left);
        }
        return style.right === "auto"
          ? area.start
          : area.end - Number.parseFloat(style.right) - width;
      };
      const boxPiecesOf = (element: Element): Piece[] => {
        const { left, right, width } = rectOf(element);
        if (width <= 0) {
          return [];
        }
        const style = styleOf(element);
        return [
          {
            element,
            part: "box",
            left,
            right,
            from: containingBlockOf(element),
            bleed: {
              left: Math.max(0, -pixelsOf(style.marginLeft)),
              right: Math.max(0, -pixelsOf(style.marginRight)),
            },
          },
        ];
      };
      const paintsNothing = (piece: Piece): boolean => {
        if (piece.part !== "::before" && piece.part !== "::after") {
          return false;
        }
        const style = getComputedStyle(piece.element, piece.part);
        const edges = [
          style.borderTopWidth,
          style.borderRightWidth,
          style.borderBottomWidth,
          style.borderLeftWidth,
          style.outlineStyle === "none" ? "0" : style.outlineWidth,
        ];
        return (
          style.content === '""' &&
          style.backgroundImage === "none" &&
          style.backgroundColor === "rgba(0, 0, 0, 0)" &&
          style.boxShadow === "none" &&
          edges.every((edge) => Number.parseFloat(edge) === 0)
        );
      };
      const pseudoPiecesOf = (element: Element): Piece[] =>
        PSEUDOS.flatMap((pseudo) => {
          const style = getComputedStyle(element, pseudo);
          const width = Number.parseFloat(style.width);
          if (
            style.content === "none" ||
            style.visibility !== "visible" ||
            !["absolute", "fixed"].includes(style.position) ||
            Number.isNaN(width) ||
            width <= 0
          ) {
            return [];
          }
          const establishes =
            style.position === "fixed"
              ? establishesFixedContainingBlock
              : establishesAbsoluteContainingBlock;
          const block = establishes(element)
            ? element
            : (nearestAncestor(element, establishes) ??
              (style.position === "fixed" ? null : root));
          const left =
            startOf(style, block === null ? windowArea : areaOf(block), width) +
            shiftOf(style, width);
          const right = left + width;
          const owner =
            element.clientWidth > 0 ? areaOf(element) : ownBoxOf(element);
          return [
            {
              element,
              part: pseudo,
              left,
              right,
              from: block,
              bleed: {
                left: Math.max(0, owner.start - left),
                right: Math.max(0, right - owner.end),
              },
            },
          ];
        });
      const textPiecesOf = (element: Element): Piece[] =>
        [...element.childNodes].flatMap((node) => {
          const first = node instanceof Text ? node.data.search(/\S/) : -1;
          if (!(node instanceof Text) || first < 0) {
            return [];
          }
          const range = document.createRange();
          range.setStart(node, first);
          range.setEnd(node, node.data.trimEnd().length);
          const lines = [...range.getClientRects()].filter(
            ({ width }) => width > 0,
          );
          if (lines.length === 0) {
            return [];
          }
          return [
            {
              element,
              part: "text",
              text: node,
              left: Math.min(...lines.map(({ left }) => left)),
              right: Math.max(...lines.map(({ right }) => right)),
              from: element,
              bleed: NO_BLEED,
            },
          ];
        });
      const piecesOf = (element: Element): Piece[] =>
        isInsideAnSvg(element)
          ? []
          : [
              ...boxPiecesOf(element),
              ...pseudoPiecesOf(element),
              ...textPiecesOf(element),
            ];

      const shown: Reaches = { boxes: new Map(), window: [] };
      const unseen: Reaches = { boxes: new Map(), window: [] };
      const reachesPast = (area: Area, piece: Piece): Reach[] =>
        (
          [
            { piece, side: "left", past: area.start - piece.left },
            { piece, side: "right", past: piece.right - area.end },
          ] as const
        ).filter(({ past }) => past > subpixel);
      const record = (
        { boxes }: Reaches,
        box: Element,
        reaches: readonly Reach[],
      ): void => {
        const known = boxes.get(box);
        if (known !== undefined) {
          known.push(...reaches);
        } else if (reaches.length > 0) {
          boxes.set(box, [...reaches]);
        }
      };
      const walk = (piece: Piece, reaches: Reaches): void => {
        let block = piece.from;
        while (block !== null && !isWindow(block)) {
          const area = areaOf(block);
          if (area.end > area.start) {
            record(reaches, block, reachesPast(area, piece));
          }
          if (styleOf(block).overflowX !== "visible") {
            return;
          }
          block = containingBlockOf(block);
        }
        reaches.window.push(...reachesPast(windowArea, piece));
      };

      const covers = (outer: Reach, inner: Reach): boolean =>
        outer !== inner &&
        outer.piece.part === "box" &&
        outer.piece.element.contains(inner.piece.element) &&
        (outer.piece.element !== inner.piece.element ||
          inner.piece.part !== "box") &&
        outer.past >= inner.past - subpixel;
      const isOwnBleed = ({ piece, side, past }: Reach): boolean =>
        past <= piece.bleed[side] + subpixel;
      const culpritsOf = (
        reaches: readonly Reach[],
        side: Side,
        excusesBleeds: boolean,
      ): Reach[] => {
        const onSide = reaches.filter((reach) => reach.side === side);
        const outermost = onSide.filter(
          (inner) => !onSide.some((outer) => covers(outer, inner)),
        );
        return excusesBleeds
          ? outermost.filter((reach) => !isOwnBleed(reach))
          : outermost;
      };
      const farthestOf = (reaches: readonly Reach[]): number =>
        Math.max(0, ...reaches.map(({ past }) => past));
      const piecesIn = (reaches: readonly Reach[]): Piece[] => [
        ...new Set(reaches.map(({ piece }) => piece)),
      ];

      const tagOf = (element: Element): string => {
        const html = element.outerHTML;
        const tag = html.slice(0, html.indexOf(">") + 1);
        return tag.length > tagLength ? `${tag.slice(0, tagLength)}…>` : tag;
      };
      const quoted = (text: string): string => {
        const label = text.replaceAll(/\s+/g, " ").trim();
        if (label === "") {
          return "";
        }
        const shown =
          label.length > labelLength
            ? `${label.slice(0, labelLength)}…`
            : label;
        return ` “${shown}”`;
      };
      const labelOf = (element: Element): string =>
        quoted(element.getAttribute("aria-label") ?? element.textContent);
      const nameOf = (piece: Piece, box: Element | null): string => {
        const { element } = piece;
        if (piece.part === "text") {
          const text = quoted(piece.text.data);
          return element === box
            ? `its own text${text}`
            : `the text of ${tagOf(element)}${text}`;
        }
        const pseudo = piece.part === "box" ? "" : piece.part;
        return `${tagOf(element)}${pseudo}${labelOf(element)}`;
      };
      const named = (pieces: readonly Piece[], box: Element | null): string => {
        const names = pieces
          .slice(0, culpritsNamed)
          .map((piece) => nameOf(piece, box));
        const unnamed = pieces.length - names.length;
        const more = unnamed > 0 ? ` and ${String(unnamed)} more` : "";
        return `${names.join(", ")}${more}`;
      };
      const pixels = (past: number): string => `${String(Math.round(past))}px`;

      const isCutOnPurpose = (box: Element): boolean => {
        const style = styleOf(box);
        const isClippedArt =
          ["hidden", "clip"].includes(style.overflowX) &&
          box.matches("[aria-hidden=true]");
        return (
          style.textOverflow === "ellipsis" ||
          style.clipPath !== "none" ||
          isClippedArt ||
          box.matches(FILLED_ROLES)
        );
      };
      const isMeantToScroll = (box: Element): boolean => {
        const style = styleOf(box);
        return (
          SCROLLING.includes(style.overflowX) &&
          (box.matches("[role=tablist]") || style.scrollSnapType !== "none")
        );
      };
      const intoEndPaddingOf = (box: Element): Piece[] => {
        const style = styleOf(box);
        const area = areaOf(box);
        const isRightToLeft = style.direction === "rtl";
        const contentEdge = isRightToLeft
          ? area.start + pixelsOf(style.paddingLeft)
          : area.end - pixelsOf(style.paddingRight);
        const reachesIntoPadding = (child: Element): boolean => {
          const { left, right } = rectOf(child);
          const { marginLeft, marginRight } = styleOf(child);
          return isRightToLeft
            ? left - pixelsOf(marginLeft) < contentEdge - subpixel
            : right + pixelsOf(marginRight) > contentEdge + subpixel;
        };
        return [...box.children]
          .filter(
            (child) =>
              IN_FLOW.includes(styleOf(child).position) &&
              !isHiddenFromPeople(child) &&
              reachesIntoPadding(child),
          )
          .flatMap(boxPiecesOf);
      };
      const outermostOf = (reaches: readonly Reach[]): Piece[] =>
        piecesIn(SIDES.flatMap((side) => culpritsOf(reaches, side, false)));
      const unseenNamed = (
        reaches: readonly Reach[],
        box: Element | null,
      ): string => {
        const culprits = outermostOf(reaches);
        return culprits.length > 0
          ? `reached past only by what people can't see: ${named(culprits, box)}`
          : "though nothing reaches past its edges";
      };
      const scrollCulpritsNamed = (
        box: Element,
        culprits: readonly Piece[],
      ): string => {
        if (culprits.length > 0) {
          return `reached past by ${named(culprits, box)}`;
        }
        const intoPadding = intoEndPaddingOf(box);
        return intoPadding.length > 0
          ? `reached into its end padding by ${named(intoPadding, box)}`
          : unseenNamed(unseen.boxes.get(box) ?? [], box);
      };
      const scrollingLinesOf = (box: Element): Line[] => {
        const reaches = shown.boxes.get(box) ?? [];
        const bySide = SIDES.map((side) => culpritsOf(reaches, side, false));
        const culprits = piecesIn(bySide.flat());
        const scrollable = box.scrollWidth - box.clientWidth;
        const outOfView = bySide.reduce(
          (sum, sideCulprits) =>
            sum +
            farthestOf(
              sideCulprits.filter((reach) => !paintsNothing(reach.piece)),
            ),
          0,
        );
        const unreachable = outOfView - Math.max(0, scrollable);
        const scrolls =
          scrollable > 0 && !isMeantToScroll(box)
            ? [
                {
                  box,
                  spills: false,
                  culprits,
                  report: `scrolls ${pixels(scrollable)} sideways, ${scrollCulpritsNamed(box, culprits)}`,
                },
              ]
            : [];
        const hides =
          unreachable > scrollWidthRounding
            ? [
                {
                  box,
                  spills: false,
                  culprits,
                  report: `hides ${pixels(unreachable)} it can't scroll to, reached past by ${named(culprits, box)}`,
                },
              ]
            : [];
        return [...scrolls, ...hides];
      };
      const cutLinesOf = (box: Element): Line[] => {
        const reaches = shown.boxes.get(box) ?? [];
        const { overflowX } = styleOf(box);
        const spills = overflowX === "visible";
        const verb = CUT_VERBS.get(overflowX) ?? "overflows";
        return SIDES.flatMap((side) => {
          const culprits = culpritsOf(reaches, side, spills).filter(
            (reach) => spills || !paintsNothing(reach.piece),
          );
          if (culprits.length === 0) {
            return [];
          }
          return [
            {
              box,
              spills,
              culprits: piecesIn(culprits),
              report: `${verb} ${pixels(farthestOf(culprits))} past its ${side} edge, reached past by ${named(piecesIn(culprits), box)}`,
            },
          ];
        });
      };
      const linesOf = (box: Element): Line[] => {
        if (
          isWindow(box) ||
          box.clientWidth === 0 ||
          isCutOnPurpose(box) ||
          isHiddenFromPeople(box)
        ) {
          return [];
        }
        return SCROLLING.includes(styleOf(box).overflowX)
          ? scrollingLinesOf(box)
          : cutLinesOf(box);
      };
      const isExplainedByInnerLines = (
        outer: Line,
        lines: readonly Line[],
      ): boolean =>
        outer.spills &&
        outer.culprits.every((culprit) =>
          lines.some(
            ({ box }) =>
              box !== outer.box &&
              outer.box.contains(box) &&
              box.contains(culprit.element) &&
              (box !== culprit.element || culprit.part !== "box"),
          ),
        );
      const inDocumentOrder = (elements: Iterable<Element>): Element[] =>
        [...new Set(elements)].sort(
          (first, second) =>
            (documentOrder.get(first) ?? 0) - (documentOrder.get(second) ?? 0),
        );

      const elements = [...document.querySelectorAll(`${scope}, ${scope} *`)];
      for (const element of elements) {
        const reaches = isHiddenFromPeople(element) ? unseen : shown;
        for (const piece of piecesOf(element)) {
          walk(piece, reaches);
        }
      }
      const scrollers = elements.filter(
        (element) =>
          SCROLLING.includes(styleOf(element).overflowX) &&
          element.scrollWidth > element.clientWidth,
      );
      const boxLines = inDocumentOrder([
        ...shown.boxes.keys(),
        ...scrollers,
      ]).flatMap(linesOf);
      const alike = Map.groupBy(
        boxLines.filter((line) => !isExplainedByInnerLines(line, boxLines)),
        ({ report }) => report,
      );
      const overflowingBoxes = [...alike].flatMap(
        ([report, [first, ...others]]) => {
          if (first === undefined) {
            return [];
          }
          const more =
            others.length > 0 ? ` (and ${String(others.length)} like it)` : "";
          return [`${tagOf(first.box)}${more} ${report}`];
        },
      );

      const windowCulprits = SIDES.map(
        (side) => [side, culpritsOf(shown.window, side, false)] as const,
      );
      const page = document.scrollingElement ?? root;
      const pageScroll = page.scrollWidth - page.clientWidth;
      const pageCulprits = piecesIn(
        windowCulprits.flatMap(([, culprits]) => culprits),
      );
      const pageScrolls =
        pageScroll > 0
          ? [
              `the page scrolls ${pixels(pageScroll)} sideways, ${
                pageCulprits.length > 0
                  ? `reached past by ${named(pageCulprits, null)}`
                  : unseenNamed(unseen.window, null)
              }`,
            ]
          : [];
      const pastTheWindow = windowCulprits.flatMap(([side, culprits]) => {
        if (culprits.length === 0) {
          return [];
        }
        const reach = culprits.length === 1 ? "reaches" : "reach up to";
        return [
          `${named(piecesIn(culprits), null)} ${reach} ${pixels(farthestOf(culprits))} past the window's ${side} edge`,
        ];
      });
      return [...pageScrolls, ...overflowingBoxes, ...pastTheWindow];
    },
    [
      within,
      NAMED_TAG_LENGTH,
      NAMED_LABEL_LENGTH,
      CULPRITS_NAMED,
      SUBPIXEL,
      SCROLL_WIDTH_ROUNDING,
    ] as const,
  );
}
