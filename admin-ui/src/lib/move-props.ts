import type { MoveState } from "#lib/move-state.ts";
import type { MoveTarget } from "#lib/wire.ts";

export interface MoveProps {
  readonly state: MoveState;
  readonly draft: string;
  readonly onDraftChange: (text: string) => void;
  readonly onChoose: (target: MoveTarget) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
  readonly onReload: () => void;
}
