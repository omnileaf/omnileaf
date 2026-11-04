export interface ReceivedTime {
  readonly iso: string;
  readonly text: string;
}

const MS_PER_SECOND = 1000;
const DATE_END = 10;
const TIME_START = 11;
const TIME_END = 16;

export function formatReceived(at: number): ReceivedTime {
  const iso = new Date(at * MS_PER_SECOND).toISOString();
  return {
    iso,
    text: `${iso.slice(0, DATE_END)} ${iso.slice(TIME_START, TIME_END)} UTC`,
  };
}
