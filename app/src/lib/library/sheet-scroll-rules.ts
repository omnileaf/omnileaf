export interface SheetScrollRules {
  readonly above: boolean;
  readonly below: boolean;
}

const SUBPIXEL = 1;

export function scrollRulesOf(body: HTMLElement): SheetScrollRules {
  return {
    above: body.scrollTop > SUBPIXEL,
    below: body.scrollTop + body.clientHeight < body.scrollHeight - SUBPIXEL,
  };
}
