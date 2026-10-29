# TaCodegraph PWA integration

Shared standard: [TA PWA guide](https://github.com/teodor-andonov/261027_ta-guides/blob/main/guides/pwa/README.md).
Icon source and generation: [TA_APP_ICON.md](TA_APP_ICON.md).

- Exact install and window name: `TaCodegraph`.
- Stable manifest ID: `/ta-cad-graph-261012/`; start URL and scope: `./`.
- `pwa-update.js` is a local copy of the shared TA update template. The message handler at the end of `sw.js` is the matching worker template. No runtime request to TA Guides is needed.
- Updates check at launch, when returning to the app, when connectivity returns, and hourly while visible. **Updates** also offers a manual check.
- A downloaded update shows **Update available**, **Update now**, and **Later**. Later keeps the current session and leaves the update available. Applying checks every open window for this app, blocks when a guard detects editing or an operation, and reloads only after all windows agree. Older windows without this protocol must be closed first.
- `window.taPwaCanUpdate()` is app-specific. Keep it aligned with all unsaved and in-progress operations when adding features. Missing/throwing guards fail closed.
- The worker caches one complete shell per release. Bump its version on every web-asset release, include all transitive runtime modules and exact icon/update-client paths, and delete only this app's caches.
- First migration to this update UI: save work, close all app windows, and reopen online once so the new worker and UI can take over.

## Publishing this app

Development and publishing are separate from runtime PWA behavior. Follow the [GitHub publishing guide](https://github.com/teodor-andonov/261027_ta-guides/blob/main/guides/publishing/github-development-and-publishing.md) and this repository's existing `.github/workflows/` policy. Do not enable automatic production publishing merely to update PWA behavior.

After release, verify the deployed manifest, icon bytes, worker/cache version, an existing installation updating from an older release, Later, dirty-state refusal, multiple windows, offline startup, and another app on the same origin.
