# First-Run Tour

The home page now introduces the available tools with a guided, read-only tour.
It opens real UI previews, highlights each control, dims/blurs its surroundings,
and supports Next, Back, Skip, keyboard arrows, Escape, and tapping the background.
Reduced-motion preferences are respected.
Browsers without backdrop-filter rendering retain the dimmed spotlight instead.

## When It Appears

- Automatically on a fresh local installation or first browser entry.
- Before the daily study-goal prompt, never on top of an active form.
- Only once after completing or skipping it in that browser/app installation.
- Existing users with saved tasks, a configured goal, progress, or a local account
  are not interrupted by this update.
- Replay at any time from Account > Ver recorrido de bienvenida, or open
  `/?tutorial=1`. That link also works from the installed application.

Completion is stored only in `estudiemos_onboarding_v1` in localStorage. It is
intentionally not synced between devices. Clearing application data resets it.
The existing daily-goal prompt resumes after completion or skipping.

## Safety and Scope

The tour does not save tasks, create activities, change the Pomodoro, edit the
home layout, invite friends, open Google OAuth, or request notification access.
Underlying controls are inert while previews are shown. Only tour controls work.
It teaches available features; disabled AI and paid features stay out of sight.
Real task alarms or a ringing Pomodoro interrupt the tour instead of being hidden.
On finish, preview dialogs close and the original home view/history are restored.

No service, subscription, analytics, backend table, or credential is added.
Driver.js 1.10.2 is vendored locally under its MIT license and loaded only when
needed. Failure to load the optional assets leaves the normal app usable.

## Verification

- `node --test tests/onboarding.test.js`
- `node tests/onboarding.smoke.cjs` (local Playwright installation used by other
  UI smoke checks: `tmp/ui-check/node_modules/playwright`, Chrome installed).
- PowerShell: `$env:TEST_WEBKIT='1'; node tests/onboarding.smoke.cjs`
- Optional `TEST_WIDTHS=320,390,1024,1440` limits browser cases.

Browser checks use isolated guest contexts and block external requests. They
verify every actual preview, viewport fit, control visibility, unchanged data and
history, no permission prompts, daily-goal ordering, reload, replay, Back and Skip.
