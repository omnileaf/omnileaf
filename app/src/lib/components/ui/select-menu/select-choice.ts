export interface SelectChoice<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

export function choiceOf<Value extends string>(
  choices: readonly SelectChoice<Value>[],
  picked: string,
): SelectChoice<Value> | undefined {
  return choices.find((choice) => choice.value === picked);
}
