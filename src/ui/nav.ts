import * as ui from "./theme";

export class GoBack extends Error {}

export const BACK_VALUE = "__back__";

export function withBack<T>(choices: { name: string; value: T }[]): { name: string; value: T | typeof BACK_VALUE }[] {
  return [...choices, { name: ui.dim("‹ Back"), value: BACK_VALUE }];
}

export function checkBack<T>(value: T | typeof BACK_VALUE): T {
  if (value === BACK_VALUE) throw new GoBack();
  return value as T;
}
