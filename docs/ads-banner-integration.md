# AdSense: bottom anchor integration

Publisher: `ca-pub-9605920128105982` (public identifier, not a secret).
Production code is enabled, but delivery is fail-closed until a confirmed Free account,
valid advertising consent and the exact origin `https://estudiemos.ar` are present.
No prices, checkout, tool restrictions or paid infrastructure are enabled.

## Deployment and external activation

- `wrangler.frontdoor.jsonc` binds `estudiemos.ar` as a custom domain to the public
  Worker `estudiemos`. `estudiemos-services` is the account's workers.dev subdomain,
  not the Worker name. The private backend service binding is unchanged.
- Keep workers.dev enabled while DNS activates. Do not redirect existing sessions
  or rewrite `APP_ORIGIN`, Auth, Drive OAuth or native origins in this release.
  Binding the domain is not the same as completing that later canonical-origin migration.
- The authoritative .ar delegation now lists leif/luciane and the zone is active.
  Universal SSL is active and Always Use HTTPS is enabled; see `custom-domain-https.md`.
  Do not disable certificate verification or weaken CSP to fix an HTTP-only visit.
- AdSense showed `Requiere revision` and unverified ownership.
  The three application heads now contain Google's ownership meta tag, and `/ads.txt`
  contains the authorized-seller record. Once HTTPS resolves, choose the meta-tag or
  ads.txt verification method and request Google's review. Code deployment is not approval.
- AdSense settings were saved with Auto ads enabled, only the regular bottom anchor
  selected (desktop included), dynamic anchors disabled, and no in-page, vignette,
  side-rail or intent formats. Automatic optimization is disabled. Do not enable
  experiments that add placements the user did not request. These settings do not
  grant site approval or bypass the app's consent and account checks.
- Finish a suitable consent-manager integration before serving. AdSense's privacy
  page had no configured consent messages at implementation time. For the EEA, UK
  and Switzerland use Google's required certified CMP. Do not assume a custom toggle
  is sufficient, or that a script load means consent, approval or an impression.

## Official format, not a manually sticky unit

`scripts/ad-provider.js` loads the supplied library asynchronously after eligibility
and an idle opportunity, with `crossorigin="anonymous"` and the documented
`data-overlays="collapsed-bottom"` parameter. This requests a non-expanding bottom
Auto anchor; there is no invented ad-slot ID, publisher iframe, manual `.push()` or
refresh loop. A manually fixed ad unit is not the approved mobile anchor format.

Google owns the creative, dimensions and body inset. `styles/ad-banner.css` makes
the dashboard use the remaining viewport rather than covering the Inbox, timer,
calendar or mobile navigation. Quick-note panels use native modal dialogs above
overlays. The integration never resizes, clips, moves or hides Google's ad DOM.
No SDK/no fill means no publisher-created empty footer. Actual fill, mobile geometry,
keyboard behavior, CSP compatibility and CLS still require a live check after approval;
mocked layout tests cannot certify Google's production runtime.

## Free versus Pro / No Ads

The controller reads the existing `EstudiemosAccount.getUser()` only. It never makes
an additional Workers/Supabase request or writes impression records. Trusted server
subscription handling must maintain Auth `app_metadata`, for example:

```json
{"estudiemos":{"planId":"pro","status":"active","noAds":true,"currentPeriodEnd":"2026-12-01T00:00:00Z"}}
```

An active Pro plan OR active `noAds: true` prevents SDK loading. Missing expiry means
until revoked; invalid/expired dates, trials, `past_due` and cancelled plans do not
grant it. Never trust editable `user_metadata`, client `is_pro`, localStorage or URLs.
**Payment-to-Auth-metadata wiring remains a future commercial task**, not an enabled
payment flow; the old trial catalog does not automatically represent paid No Ads.

Normal Auth refresh emits `estudiemos:account-change`. Once Google's top-level SDK
has loaded, Pro upgrades, signout, account switches and consent revocation use a clean
same-origin reload: removing a script cannot unexecute it. Saved app data is preserved;
unsaved form drafts should be saved before changing accounts or subscription state.
No request already sent to Google can be retroactively cancelled.

## Consent and security boundary

The future verified CMP bridge must provide:

```js
window.EstudiemosAdConsent = {
  getStatus: () => 'unknown' // granted only after actual required authorization
};
window.dispatchEvent(new Event('estudiemos:ads-consent-change'));
```

Without `granted`, there is no provider import, CSS reservation or third-party ad
request. Never hardcode consent in production. The current release supplies no fake
CMP or permissive default. Review school-age audiences before deployment to schools.

Only `{slot, signal}` reaches the adapter; no account ID, email, credential, study
history, task or course content is intentionally passed. **This is not a sandbox**:
the official AdSense library executes in the top-level page and could access its DOM
and browser storage. That vendor trust/privacy boundary requires review and consent;
do not claim that private app data is technically inaccessible to the SDK.
Android's native WebView is excluded until an approved native advertising integration.

`vercel.json` remains the shared HTTP-header source for the Cloudflare static build.
Only exact initial Google ad hosts are added, without `*`, `unsafe-eval` or new inline
script permissions. Real Google dependencies may require a further narrow CSP review;
do not relax the policy globally merely to obtain ad fill.

## Files and checks

- `shared/ads.js`, `shared/release.js`: eligibility and independent advertising switch.
- `scripts/ad-banner.js`, `scripts/ad-provider.js`: conditional idle lifecycle, official
  adapter, timeout/error cleanup, account/consent updates and clean navigation.
- `styles/ad-banner.css`, `scripts/dashboard.js`, `styles/dashboard.css`: viewport
  reservation and native quick-note/assistant modals.
- `index.html`, `mi-espacio.html`, `materias.html`: ownership metadata and module entry.
- `ads.txt`, `scripts/build-cloudflare.cjs`, `vercel.json`, `scripts/csp-check.js`:
  public seller record, static packaging and reviewed HTTP policy.
- `about.html`: conditional-advertising disclosure and Google privacy link.
- `tests/ads.test.js`, `tests/ads-banner.smoke.cjs`, `tests/adsense-anchor.smoke.cjs`:
  eligibility, generic controller and actual-adapter fixtures. All SDK/creative requests
  are simulated locally: no real ads, clicks, impressions or tracking consent.

```powershell
node --test tests/ads.test.js
node tests/ads-banner.smoke.cjs
node tests/adsense-anchor.smoke.cjs
node scripts/csp-check.js
node scripts/security-check.js
node scripts/build-cloudflare.cjs
npx --no-install wrangler deploy --config wrangler.frontdoor.jsonc
```

Primary references:
- https://support.google.com/adsense/answer/7478225
- https://support.google.com/adsense/answer/10734935
- https://support.google.com/adsense/answer/9305577
- https://support.google.com/adsense/answer/7584263
- https://support.google.com/adsense/answer/3394713
- https://support.google.com/adsense/answer/1346295
