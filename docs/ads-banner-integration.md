# AdSense: bottom anchor integration

Publisher: `ca-pub-9605920128105982` (public identifier, not a secret).
Production delivery is paused after the 12 November 2026 site review. The
ownership meta tag, authorized `ads.txt` and InMobi preferences remain active.
No prices, checkout, tool restrictions or paid infrastructure are enabled.

## Site review (12 November 2026)

- The public `/guias/` library is readable without an account, scripts or third-party
  requests. The sitemap lists the canonical public documents; the older resource
  directories are still navigable but no longer promoted for indexing.
- `shared/release.js` keeps ads off on the application dashboards. Do not flip
  the switch simply because the site becomes Ready. Review the actual pages and
  proposed placements against [Google's inventory policy](https://support.google.com/publisherpolicies/answer/11112688),
  and keep consent/Pro rules on any approved placement.
- Ownership is already established. Request review from Sites, without deleting
  the site or changing its authorized seller record.

## Previous production status (5 November 2026)

PR #128 enabled InMobi Choice globally on the advertising-capable PWA screens:
Inicio (`/`), Mi espacio (`/mi-espacio`) and Materias (`/materias`), including
their HTML aliases. The CMP is not limited to the standalone verification page.
The exact-origin/top-window guard excludes workers.dev, frames and the native
Android bridge. Invitations, installation pages and desktop widgets do not
bootstrap advertising. `cloudflare/frontdoor.mjs` adds the required CMP hosts
only to these application documents, preserving the baseline security policy.

Cookie preferences are available from Cuenta -> Preferencias de cookies and
the privacy/footer links. `scripts/cmp-preferences.js` reopens the official
`displayConsentUi` API in place, or falls back to
`https://estudiemos.ar/consentimiento?preferencias=1`. That standalone page
remains noindex, with no account module or advertising hosts in its CSP.

The official AdSense SDK is enabled conditionally, not unconditionally: it
requires a confirmed Free account, valid TCF consent and the canonical origin.
Rejecting, revoking, Pro/No Ads or signing out prevents a new ad load; revocation
after the SDK has executed triggers clean navigation. Production browser tests
on Chromium and WebKit verified persistent denial across all three screens.
Google ad requests were intercepted, so these tests generated no real impressions.

The owner reports the payment profile and ad setup complete, with the site
`Preparando el sitio` and ads.txt `Autorizado`. This is not Google's approval.
Once the site is Ready, check actual anchor geometry, keyboard interactions,
CLS and the real SDK's CSP dependencies without clicking your own ads.
Revalidate the published vendor restriction when InMobi's automatic Premium
trial falls back to Essentials; do not subscribe or integrate SSP to preserve it.

## Deployment and external activation

- `wrangler.frontdoor.jsonc` binds `estudiemos.ar` as a custom domain to the public
  Worker `estudiemos`. `estudiemos-services` is the account's workers.dev subdomain,
  not the Worker name. The private backend service binding is unchanged.
- `estudiemos.ar` is the public canonical origin, including metadata and sitemap.
  The workers.dev mirror stays enabled for existing sessions and integrations.
  SEO metadata changes must not rewrite `APP_ORIGIN`, Auth, Drive OAuth or native
  origins, or silently redirect existing sessions between browser origins.
- The authoritative .ar delegation now lists leif/luciane and the zone is active.
  Universal SSL is active and Always Use HTTPS is enabled; see `custom-domain-https.md`.
  Do not disable certificate verification or weaken CSP to fix an HTTP-only visit.
- The three application heads contain Google's ownership meta tag, and `/ads.txt`
  contains the authorized-seller record. Ownership and review were requested;
  do not remove and resubmit the site while Google is preparing it.
- AdSense settings were saved with Auto ads enabled, only the regular bottom anchor
  selected (desktop included), dynamic anchors disabled, and no in-page, vignette,
  side-rail or intent formats. Automatic optimization is disabled. Do not enable
  experiments that add placements the user did not request. These settings do not
  grant site approval or bypass the app's consent and account checks.
- The CMP is verified and the conditional SDK is deployed. Google's readiness
  and availability still govern real delivery. Neither the verification meta
  tag nor `ads.txt` loads an ad or a CMP.

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

`scripts/ad-consent.js` listens to a certified CMP's IAB TCF API v2. It requires a
completed decision from Google Privacy & messaging (CMP ID 300) or InMobi Choice
(CMP ID 10), TC data for Google (vendor 755) and the applicable purposes, respecting
publisher restrictions. A missing API, missing decision or unsupported region stays
ad-free; no decision is manufactured from localStorage. The ad SDK independently
validates the TC string. The bridge itself is not a CMP.

### Operational checks

1. Confirm that AdSense shows `estudiemos.ar` as ready and review age-related
   publisher requirements before advertising to a student audience.
2. Use a certified standalone CMP tag configured for the exact domain. InMobi
   Choice documents a free web CMP and generates the tag in its portal. Set the
   privacy policy to `https://estudiemos.ar/about.html#privacidad`, include Google
   Advertising Products, and retain equally accessible reject and manage choices
   and the CMP's persistent privacy settings control. Do not add consent-or-pay.
3. Install the official CMP stub before the ad module and review only the required
   CSP hosts. Do not use a dummy TCF string, an invented tag URL, or load the AdSense
   SDK to bootstrap consent. Google's own European message is certified but normally
   loads via the AdSense tag; it is not a standalone pre-consent loader here.
4. Verify fresh, accept, reject, change, revoke, returning, Pro, anonymous and
   mobile standalone flows with no real ad clicks.

Without `granted`, there is no provider import, CSS reservation or third-party ad
request. The official InMobi v3 tag runs on the canonical application screens
listed above as well as the standalone privacy settings page. InMobi's TCF 2.3
vendor list allows only Google Advertising Products (755); newly added vendors
are blocked by default. No SSP, consent-or-pay or paid subscription was activated.

Run `node tests/inmobi-preview.smoke.cjs --live` to verify the real CMP in an
isolated browser. Add `--partners` to exercise the individual vendor panel.
The test requires a real `useractioncomplete` denial, a changed TC string and
consent cookies, denial after reload, and zero ad requests. In the summary
panel, use its visible **Reject All** control; in **Partners**, use **Reject All**
and then **Save & Exit**. The CMP can also render a separate **Disagree**
button. Clicking a generic rejection locator or merely closing the modal
does not demonstrate revocation. The observer receives the CMP decision;
it never writes or replaces a vendor cookie or TC string.

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
- `scripts/ad-banner.js`, `scripts/ad-consent.js`, `scripts/ad-provider.js`: TCF listener, conditional idle lifecycle, official
  adapter, timeout/error cleanup, account/consent updates and clean navigation.
- `styles/ad-banner.css`, `scripts/dashboard.js`, `styles/dashboard.css`: viewport
  reservation and native quick-note/assistant modals.
- `index.html`, `mi-espacio.html`, `materias.html`: ownership metadata and module entry.
- `scripts/inmobi-choice-tag.js`, `scripts/cmp-preferences.js`, `scripts/account.js`,
  `consentimiento.html`, `cloudflare/frontdoor.mjs`: global CMP bootstrap,
  persistent preferences, standalone fallback and scoped response policy.
- `ads.txt`, `scripts/build-cloudflare.cjs`, `vercel.json`, `scripts/csp-check.js`:
  public seller record, static packaging and reviewed HTTP policy.
- `about.html`: conditional-advertising disclosure and Google privacy link.
- `tests/ads.test.js`, `tests/ads-banner.smoke.cjs`, `tests/adsense-anchor.smoke.cjs`:
  eligibility, generic controller and actual-adapter fixtures. All SDK/creative requests
  are simulated locally: no real ads, clicks, impressions or tracking consent.

```powershell
node --test tests/ads.test.js tests/ad-consent.test.js
node tests/inmobi-pwa.smoke.cjs --live
$env:TEST_WEBKIT='1'; node tests/inmobi-pwa.smoke.cjs --live
Remove-Item Env:TEST_WEBKIT
node tests/ads-banner.smoke.cjs
node tests/adsense-anchor.smoke.cjs
node scripts/csp-check.js
node scripts/security-check.js
node scripts/build-cloudflare.cjs
npx --no-install wrangler deploy --config wrangler.frontdoor.jsonc
```

Primary references:
- https://support.google.com/adsense/answer/13554116
- https://support.google.com/adsense/answer/9804260
- https://support.google.com/adsense/answer/14660912
- https://support.inmobi.com/choice/getting-started-cmp/implementing-cmp-via-code/web-sdk/basic-implementation
- https://support.google.com/adsense/answer/7478225
- https://support.google.com/adsense/answer/10734935
- https://support.google.com/adsense/answer/9305577
- https://support.google.com/adsense/answer/7584263
- https://support.google.com/adsense/answer/3394713
- https://support.google.com/adsense/answer/1346295
