# AdSense: review follow-up, 21 November 2026

## Verified diagnosis

The Sites panel reports `Low value content` after the 20 November review, with
ads.txt still authorized. Ownership and delivery are not the reported failure.
The email links to Google's general approval video, not to an individual audit:
<https://www.youtube.com/watch?v=lZUG0XGlZZY> (10 February 2020).

Its relevant checks are public access (1:10), original value (2:09), useful
navigation (2:27), and the whole site's experience, not just one URL (2:38).
The current guidance also recognizes useful online tools; it does not mandate
a blog or a particular article count:

- <https://support.google.com/adsense/answer/12176698>
- <https://support.google.com/adsense/answer/10015918>
- <https://adsense.google.com/start/resources/3-types-of-sites/>

Google did not identify a particular failing URL. The first-visit obstacles below
are reproducible issues we can address, not proof of Google's internal reasoning.
The panel also asks for authentic, sustained user interest. Code cannot create
that evidence or guarantee approval; do not invent activity or buy review traffic.

## Minimal product changes

- Keep the existing dashboard, tools, accounts, data, layout and integrations.
- Make the existing empty Inbox explain the university use case and directly
  link the real anonymous planner, first-task editor, Tutorial and About page.
- Do not wait for an unconnected Drive to resolve before showing a guest welcome.
- New anonymous browser visits no longer launch the Tutorial or daily-goal
  configuration automatically. Both remain available manually. A first installed
  PWA/Android launch keeps its tutorial, with privacy controls still taking priority.
- Update the root title/description and About link. No blog, extra article,
  crawler-only response, account-data exposure, new API, database query or polling.

## Impressions are unchanged

`release.features.ads` remains false. No production AdSense script or ad request
is enabled by this patch. The existing publisher ID, ads.txt, CMP, DNS and account
configuration remain untouched.

Future manual placements stay gated on site approval, separately reviewed units,
valid consent and audience eligibility: `/semana` and `/progreso`, below real
populated reports, outside the controls. No automatic refresh on timer ticks,
calendar changes, task edits or tab refocus. Pro, empty reports, unknown consent,
unverified audience and installed/native contexts remain excluded. This is a
prepared pilot, not authorization to serve or a promise that Google accepts it.

An opportunity is not a billable impression: actual delivery, demand, consent,
ad blocking, geography and measurement affect totals. Staying longer or tapping
more controls does not manufacture additional impressions. A displayed impression
is also distinct from Google's viewability measurement.

## Requesting another review

After verifying production, in AdSense open Sites > estudiemos.ar, read the
reported issue, confirm the corrections and request review. Do not remove/re-add
the site, change the publisher ID, or enable ads to try to force approval. Give
reviewers a stable public site. Actual recurring student usage remains important;
these UX corrections alone cannot establish sustained interest.

## Validation

- 636 standalone unit tests and 2 browser-dependent unit tests passed.
- The built product smoke suite passed Chrome desktop and WebKit mobile:
  anonymous task creation, optional tutorial, local persistence, planner editing,
  conflicts and export, account-bound reports, and disabled production ads.
- Isolated ad fixtures verified one manual request with no automatic refresh,
  revocation, Pro, empty-state, unknown-consent, audience and native exclusions.
- Installed tutorial smoke tests passed Chrome at 1440/390 px and WebKit at
  390/320 px, including replay, skip, alarm priority and reduced motion.
- Home starter flows passed at 1440, 1024, 768, 390 and 320 px; CSP verification
  and both Workers' credential-free dry-run compilation passed.
- These are automated browser-engine tests, not a claim of a new physical
  iPhone/Android test or a guarantee of approval by Google's reviewers.
