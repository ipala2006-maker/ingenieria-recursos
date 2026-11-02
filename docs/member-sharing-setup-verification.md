# Member sharing and Windows setup - 2026-11-02

## Changes

- Every enrolled member of an active course can share its invitation. Codes are returned only in the already-requested private detail, not added to recurring course snapshots.
- Expelled users and outsiders cannot read details; archived courses return no invitation. Sharing grants no edit, roster, role-management or code-rotation permission.
- Native modals contain overscroll and lock document scrolling, including while another modal is open. Closing restores the normal scroll behavior without saving or moving the user's position.
- Windows activation shows only the current action. A verified native receipt reveals the file permission action; only the existing local bridge's successful schedule readiness shows activation. Consent, same-account binding, signed handoffs and file validation are unchanged. Testing is optional.
- Windows binary unchanged. HTTPS bytes and SHA-256 verified; a public checksum is included in the asset allowlist. Installer signature/reputation limitations are documented separately in `windows-download-review.md`.

## Production database

`supabase/classroom-member-sharing.sql` replaces only the existing private detail function. Its membership predicate, team privacy, event versions and execution ACL are retained. The equivalent one-field change was applied to production on 2026-11-02 after comparing the existing function definition. Verified: member sharing enabled, anonymous execution denied, direct authenticated execution denied. No user data was changed.

## Verification

- Full application regression: 518 passed, none skipped, including Windows isolated fixtures.
- Mobile notification and widget regression: 22 passed.
- Classroom smoke: real HTTP and isolated PostgreSQL, student sharing plus existing roles, Drive, conflicts, history and enrollment.
- Alarm setup smoke: simulated native protocol, explicit consent, pending vs linked vs ready, account changes and optional test.
- Windows bundle smoke in Edge: complete download remains available, first launch skips repeat installation, consent and sign-in work.
- Modal scroll smoke in Chromium and WebKit: 1440, 768 and 390 px; interior scrolling, backdrop lock, nested close and restored page scroll. These are engine/viewport tests, not a physical iPhone test.
- UI-flow smoke in Chrome: 1440, 1024, 768, 390 and 320 px; dark/light/reduced motion, notes, calendar, timer, courses, account, customization, Drive and install.
- Security checks, CSP checks and both Workers dry-run builds passed.

No real alarms, catedras, Drive files or personal tasks were created, deleted or used by the local fixtures.
