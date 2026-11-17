# phub.ink

A free, open-source link shortener with click analytics and editable QR codes.

**Live site:** https://phub.ink

## What it does

- **Short links** with random or custom endings.
- **Click analytics:** clicks, unique visitors, QR scans, countries, devices, browsers and referring sites, with a chart and a CSV download.
- **QR studio:** codes for a website link, plain text, Wi-Fi or email. A tracked code counts scans and can change destination later. A plain code works forever, even without this site. Styles, logos, scan checks, SVG and PNG export.
- **Passwordless sign-in:** a one-time link sent by email.
- **Built-in safety:** bot checks (Cloudflare Turnstile), rate limits, a domain blocklist, a public report page, and an admin console with reports, feedback, links, accounts, blocked domains, an audit log and a kill switch.
- **Privacy by design:** no IP addresses stored, no tracking cookies, a visitor fingerprint that changes every day, raw clicks deleted after 90 days, and a data export and account deletion in Settings.

## Built with

TypeScript, Cloudflare Workers with [Hono](https://hono.dev), Cloudflare D1 (SQLite), a static front end built with Vite and Tailwind CSS, Chart.js and qr-code-styling, Cloudflare Turnstile, Resend for email, and Vitest for tests.

## Project layout

- `src/`: the Worker (API, redirects, nightly job). Routes in `src/routes`, logic in `src/lib`.
- `migrations/`: the database, built one numbered step at a time.
- `web/`: the website (pages, scripts, styles, security headers in `web/public/_headers`).
- `tests/`: unit tests. `scripts/`: integration and smoke tests.

## Run it locally

You need a recent version of Node.js.

```
npm install
```

Create a file called `.dev.vars` in the project folder. It is ignored by Git and holds local-only settings:

```
APP_ENV=development
APP_URL=http://127.0.0.1:8787
TURNSTILE_SITE_KEY=<Cloudflare's dummy site key>
TURNSTILE_SECRET_KEY=<Cloudflare's dummy secret key>
ADMIN_EMAILS=you@example.com
```

Use the testing keys that Cloudflare publishes in its Turnstile documentation. **Never use the dummy keys in production.** Then:

```
npx wrangler d1 migrations apply ph-ink --local
npm run dev
```

Open http://127.0.0.1:8787 (use `127.0.0.1`, not `localhost`). In development, sign-in links are printed in the terminal instead of being emailed.

## Tests

```
npm run typecheck
npm test
```

`npm run test:all` runs the integration scripts. Start `npm run dev` first. Never add `--remote` to a test command.

## Deploy your own copy

1. Create a D1 database and put its id in `wrangler.toml`.
2. Set your own address in `APP_URL`, your Turnstile site key and the sender in `EMAIL_FROM`.
3. Apply the migrations: `npx wrangler d1 migrations apply <your-database> --remote`.
4. Set the secrets with `npx wrangler secret put <NAME>`: `ADMIN_EMAILS`, `TURNSTILE_SECRET_KEY` and `RESEND_API_KEY`.
5. Run `npm run deploy`.

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Contributing

Issues and pull requests are welcome. Run `npm run typecheck` and `npm test` before sending changes. By contributing you agree that your work is released under the same licence.

## Licence

phub.ink is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). If you run a modified version as a public service, you must publish your changes under the same licence. See the [LICENSE](LICENSE) file.