const PLACEHOLDER = /\{(\w+)\}/g;

export function fillTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(PLACEHOLDER, (_placeholder, name: string) => {
    const value = values[name];
    if (value === undefined) {
      throw new Error(`template "${template}" has no value for {${name}}`);
    }
    return String(value);
  });
}
