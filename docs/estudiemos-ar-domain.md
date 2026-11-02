# estudiemos.ar custom domain - 2026-11-02

## Scope

`wrangler.frontdoor.jsonc` binds the apex `estudiemos.ar` to the existing public Worker `estudiemos` with `custom_domain: true`. `estudiemos-services` is the account's workers.dev subdomain, not the serving Worker name. The private `estudiemos-candidate` service binding and its secrets are unchanged.

`workers_dev: true` preserves the working production URL, existing installed clients and integration callbacks. This change does not include PR #119's advertising foundation, a canonical-origin cutover, new OAuth callbacks, DNSSEC changes, purchases or paid subscriptions.

## Deployment

```powershell
node scripts/build-cloudflare.cjs
npx --no-install wrangler deploy --config wrangler.frontdoor.jsonc
```

The initial deployment uploaded the Worker but could not infer a Cloudflare DNS zone for the custom domain (10082). The zone was missing in the serving account. It was added on the Free plan, without importing DNS records or enabling managed robots.txt changes. A second Wrangler deployment succeeded and reported:

```text
https://estudiemos.estudiemos-services.workers.dev
estudiemos.ar (custom domain)
Current Version ID: ef38c943-5ffe-430b-bcde-fc013db065ff
```

The Cloudflare dashboard confirms a managed Worker DNS record for `estudiemos.ar`, connected to `estudiemos`, and the Free plan.

## Public activation still pending

Cloudflare reports: Waiting for your registrar to propagate your new nameservers.

The exact assigned nameservers are:

```text
leif.ns.cloudflare.com
luciane.ns.cloudflare.com
```

NIC Argentina must delegate to this exact pair. No registrar setting was changed by this task. Google and Cloudflare public DNS still returned NXDOMAIN during verification, and a normal verified HTTPS request could not resolve the hostname. Do not claim the domain or its TLS certificate is publicly ready until DNS and HTTPS checks succeed. No TLS validation was bypassed.

No further deployment is required solely for DNS propagation. Cloudflare manages the custom domain's DNS record/certificate. Keep the workers.dev URL available while waiting.

## Follow-up before promoting this as the canonical app origin

The application still has explicit workers.dev canonical/install/share URLs, Drive origin checks and OAuth callbacks, CAPTCHA hostnames, Supabase Auth redirect allowlists and native-client origin rules. These require a separate coordinated update and verification; merely binding a custom domain does not migrate sessions, PWA installations, permissions or notification registrations. In particular, Drive's server-side origin check still deliberately permits the established origin only.

## Checks

- Seven focused frontdoor/configuration tests passed, including original request identity/host on the custom domain.
- Existing workers.dev homepage returned HTTPS 200 after deployment.
- Published HTML contained no advertising module; the pending advertising branch was not deployed.
- CSP check passed. No new dependencies or secrets were introduced.

Reference: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
