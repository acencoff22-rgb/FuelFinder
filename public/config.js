/*
 * FuelFinder frontend configuration.
 *
 * The static frontend is served separately from the Node API so the page
 * itself never waits for a sleeping Render Web Service.
 */
window.FUELFINDER_CONFIG = Object.freeze({
  apiBaseUrl: "https://fuelfinder-ejo2.onrender.com",
});
