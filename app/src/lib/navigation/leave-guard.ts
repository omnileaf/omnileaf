let guards: readonly (() => boolean)[] = [];

export function guardLeaving(isGuarding: () => boolean): () => void {
  guards = [...guards, isGuarding];
  return () => {
    guards = guards.filter((guard) => guard !== isGuarding);
  };
}

export function isLeavingGuarded(): boolean {
  return guards.some((isGuarding) => isGuarding());
}
