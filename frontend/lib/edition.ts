/** Fallback when Settings API is unavailable (build-time metadata + first paint). */
export const DEFAULT_EDITION_NUMBER = 33;

export function appShortName(edition: number = DEFAULT_EDITION_NUMBER): string {
  return `System ${edition}`;
}

export function appFullName(edition: number = DEFAULT_EDITION_NUMBER): string {
  return `Engineering Job Fair System ${edition}`;
}
