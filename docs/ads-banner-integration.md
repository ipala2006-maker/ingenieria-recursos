# Phase 2: bottom banner foundation

Status: prepared, not monetizing. `shared/release.js` keeps `ads: false`, and `scripts/ad-provider.js` is unconfigured. No advertising account, third-party tag, tracking, billing, CSP exception or production change has been activated.

## Files and responsibilities

- `shared/release.js`: release switch; independent of tool access and payment flags.
- `shared/ads.js`: eligibility and Pro/No Ads expiration rules.
- `scripts/ad-banner.js`: asynchronous lifecycle, profile/consent changes, one mount per eligible account, timeout, cancellation and cleanup.
- `scripts/ad-provider.js`: deliberately empty first-party adapter; the selected provider's official integration belongs here.
- `styles/ad-banner.css`: fixed bottom band with its own reserved height and safe-area padding. The dashboard reflows within its remaining viewport; mobile navigation is above the band. Dialogs, layout editing and mobile text input hide the creative without shifting the underlying page.
- `index.html`, `mi-espacio.html`, `materias.html`: deferred ES-module entry, not a blocking vendor tag. No ads in widgets, the floating timer, installation, public invitation or authentication pages.
- `tests/ads.test.js`, `tests/ads-banner.smoke.cjs`: policy, privacy and local lifecycle/layout fixtures. The smoke uses a fake creative and sends no impressions to a real provider.

## Free versus Pro / No Ads

The controller reads the already-loaded `EstudiemosAccount.getUser()` only. It does not call Workers, Supabase, `plan-status` or a database on every view or impression.

The future trusted subscription handler must maintain this **server-managed** Auth metadata, for example:

```json
{
  "app_metadata": {
    "estudiemos": {
      "planId": "pro",
      "status": "active",
      "noAds": true,
      "currentPeriodEnd": "2026-12-01T00:00:00Z"
    }
  }
}
```

An active Pro plan OR an explicit active No Ads entitlement hides the entire band. Missing expiry means active until revoked; invalid/expired expiry is not active. `test`, `past_due` and `cancelled` do not grant No Ads. Free users require a confirmed signed-in account and advertising consent. Unknown auth state hides the band to prevent flashing an ad to Pro users.

Never trust `user_metadata`, localStorage, a client-provided `is_pro`, a URL parameter, or editable synced study state. No Ads is a presentation decision, not a server authorization mechanism. **The payment-to-metadata bridge is not implemented by this foundation**; the old `user_plans` trial catalog is not automatically treated as a paid subscription. Do not enable commercial display until the trusted source of entitlements is connected and tested.

After the server changes entitlements, refresh the existing Auth session/user using the normal account flow and emit `estudiemos:account-change`; the band then disappears immediately and the adapter is destroyed. JWT/user metadata may otherwise remain stale until the normal Auth refresh. No polling is introduced. Hiding an ad cannot retroactively cancel requests a vendor already sent before the upgrade.

## Consent and privacy

Connect a suitable consent manager through:

```js
window.EstudiemosAdConsent = {
  getStatus: () => 'unknown' // 'granted' only after the actual required consent
};
window.dispatchEvent(new Event('estudiemos:ads-consent-change'));
```

Without `granted`, no provider import, slot, CSS space or third-party script is created. Denial/revocation destroys the current placement. Do not hardcode `granted` in production or assume contextual ads always eliminate consent requirements. Choose an appropriate provider/CMP before activation; this is not a completed CMP or a legal compliance guarantee. Review suitability for school-age users before targeting schools.

The adapter receives only `{slot, signal}`. Do not send emails, IDs, Auth tokens, study history, task titles, files, course content or grades to advertisers. Passing only these arguments does **not** sandbox JavaScript: a vendor script injected in the main app could still read its DOM and Auth localStorage. The selected integration must keep the creative/vendor code in an approved cross-origin/sandboxed frame, without parent-document access. If the network only supports top-level scripts, stop and design an isolated ad origin before enabling it. No such third-party code is present in this foundation.

## Provider contract

1. Choose a network or direct sponsor that explicitly permits the intended bottom placement and app surface. No advertising spend is required by this code; no provider has been selected or contracted.
2. Replace the stub with the provider's official integration. Set `configured=true` only once all required public publisher/slot identifiers are supplied. Publisher IDs are public identifiers, not private API keys. Keep private credentials off the client.
3. Keep module import side-effect-free. Initialize the approved **isolated** creative inside `mount`, asynchronously, only after eligibility and consent. Do not inject vendor JavaScript in the main app or enable Auto Ads/a second anchor that bypasses this controller. Prefer a restrictive sandbox and no-referrer. Do not weaken isolation merely to make an unsupported tag run.
4. Return `null` for no-fill, or `{destroy()}` for a rendered placement. Make cleanup idempotent. Listen for `signal.abort`; destroy slots, timers/listeners and vendor refresh when revoked, logging out or changing accounts. A result that finishes late must also be cleanable.
5. Use the provider's supported responsive format. The available creative height is 50 px on mobile/short screens and 90 px on wider/taller desktop. Available width is at most 728 px and viewport minus 16 px; a 320 px viewport needs an approved smaller responsive size. Do not clip, scale, cover or stretch an ad to make it fit.
6. Obtain real fill/no-fill from provider callbacks; no fake creative or fake impression counting in production. The local timeout is 12 seconds and there is no automatic retry/refresh loop. Do not count time in hidden tabs or modals as a new view. Provider billing defines valid impressions/viewability; a static DOM slot does not itself generate CPM revenue.
7. Review the exact `frame-src` hosts in `vercel.json` (the shared header source for Workers) and the isolated creative's own CSP. Keep the main app's `script-src` restricted: no advertiser script hosts there. Add only documented hosts with focused tests; never `*`, broad unsafe-inline, or a proxy through Workers to bypass a blocked tag. Provider-specific isolation/handshake validation remains pending until selection.
8. Android's native WebView is intentionally excluded until a compliant integration is implemented. PWA/browser support does not automatically authorize a WebView wrapper.
9. Update privacy disclosures and test browser, PWA, low-end/mobile performance, ad-blocking, consent, Pro upgrades, account switches, no-fill and network failure. Then enable `ads: true` in a reviewed PR. No subscription prices, checkout or tool restrictions are enabled by that switch.

## Costs and performance

- Disabled: two small first-party static modules, no banner/style/provider/third-party requests.
- Enabled: controller and styles are CDN assets, not Worker API executions. A free eligible account loads the adapter after an idle opportunity; Pro and unknown/denied consent never load it.
- Provider requests go directly to the provider; there are no per-impression Supabase writes or Workers requests. Vendor CPU, bandwidth, cookies and SDK behavior still require real measurements after selection.
- Reserved space prevents creative insertion from covering study controls. Initial activation or removal changes available workspace height; do not claim zero CLS without measuring the real provider and consent flow.
- Scope is the three primary application surfaces; legacy resource-reading pages are not monetized by this change.
- No database migration, additional Worker endpoint, Realtime subscription or new dependency is required. The disabled controller and policy modules total about 1.9 KB gzip before HTTP overhead; vendor weight is not yet measurable because no provider is installed.

## Verification

Application regression: 522 tests passed, none skipped. Chrome and WebKit banner fixtures passed at 1440, 1024, 768, 390 and 320 px, including Pro removal, consent, no-fill, errors and late completion. Drive and teacher surfaces and the Android exclusion were checked locally. Security/CSP checks and both Workers dry-run builds passed. These are simulated ads, not live provider certification or a physical-device performance measurement.

```powershell
node --test tests/ads.test.js
node tests/ads-banner.smoke.cjs
node scripts/csp-check.js
node scripts/security-check.js
npm run cloudflare:check
```

Primary guidance:
- https://developers.google.com/publisher-tag/guides/minimize-layout-shift
- https://support.google.com/adsense/answer/15484692
- https://support.google.com/admanager/answer/6310245
- https://developers.google.com/admob/android/browser/webview/api-for-ads
