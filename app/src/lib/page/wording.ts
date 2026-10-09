type Message = () => string;

export interface WordingByWidth {
  readonly onPhones: Message;
  readonly fromMedium: Message;
}

export function atEveryWidth(message: Message): WordingByWidth {
  return { onPhones: message, fromMedium: message };
}
