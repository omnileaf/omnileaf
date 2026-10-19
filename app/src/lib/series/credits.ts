import type { CreatorRole, SeriesCreator } from "#lib/ipc/bindings.ts";

export type Credits =
  | {
      readonly kind: "by";
      readonly names: readonly string[];
      readonly more: number;
    }
  | {
      readonly kind: "roles";
      readonly credits: readonly { role: CreatorRole; name: string }[];
      readonly more: number;
    };

export interface RoleCredit {
  readonly role: CreatorRole | null;
  readonly names: readonly string[];
}

const NAMED_WITHOUT_ROLES = 2;
const ROLE_ORDER: readonly (CreatorRole | null)[] = [
  "storyAndArt",
  "story",
  "art",
  null,
];

export function creatorsByRole(
  creators: readonly SeriesCreator[],
): RoleCredit[] {
  return ROLE_ORDER.map((role) => ({
    role,
    names: creators
      .filter((creator) => creator.role === role)
      .map((creator) => creator.name),
  })).filter((credit) => credit.names.length > 0);
}

export function creditsOf(
  creators: readonly SeriesCreator[],
): Credits | undefined {
  if (creators.length === 0) {
    return undefined;
  }
  const byRole = creatorsByRole(creators);
  const credits = byRole.flatMap(({ role, names: [name] }) =>
    role === null || name === undefined ? [] : [{ role, name }],
  );
  const hasRoles = credits.length === byRole.length;
  const isOneRole = credits.length === 1 && credits[0]?.role === "storyAndArt";
  if (!hasRoles || isOneRole) {
    const names = creators
      .slice(0, NAMED_WITHOUT_ROLES)
      .map((creator) => creator.name);
    return { kind: "by", names, more: creators.length - names.length };
  }
  return { kind: "roles", credits, more: creators.length - credits.length };
}
