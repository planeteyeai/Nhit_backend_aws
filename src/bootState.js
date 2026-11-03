/** Shared readiness for the early /health handler in boot.js. */
export const bootState = {
  ready: false,
  bootError: null,
  /** Optional enricher called on each /health once the app is attached. */
  enrich: null,
}
