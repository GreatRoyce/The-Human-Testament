export function readAccountToken(location) {
  return new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
}
export function scrubAccountLink(browserWindow) {
  const clean = new URL(browserWindow.location.href);
  clean.hash = ''; clean.searchParams.delete('token');
  browserWindow.history.replaceState(browserWindow.history.state, '', clean.pathname + clean.search);
}
// Preserve existing recovery imports while sharing the same safe link handling.
export const readResetToken = readAccountToken;
export const scrubResetLink = scrubAccountLink;
