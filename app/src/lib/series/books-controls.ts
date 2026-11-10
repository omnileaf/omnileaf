export type BooksControls =
  | { readonly kind: "own" }
  | {
      readonly kind: "above";
      readonly headingId: string;
      readonly search: string;
      readonly onSearch: (search: string) => void;
    };

export const OWN_CONTROLS: BooksControls = { kind: "own" };
