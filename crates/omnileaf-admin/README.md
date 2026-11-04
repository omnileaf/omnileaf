# omnileaf-admin

The review dashboard for problem reports, served at `omnileaf.app/admin`. It is a separate service from the relay and reaches it only through the relay's private admin API. The service in Rust signs people in, reads the relay and writes status changes. The interface is a single-page app from `admin-ui/`, built ahead of time into static files that the service serves to signed-in visitors.

## Sign-in

`GET /admin/login` sends the visitor to GitHub's OAuth web flow with the `read:org` scope and a random state that comes back in a signed cookie lasting ten minutes. `GET /admin/auth/callback` checks that state, exchanges the code, reads the person's login, and lets them in only when the login is on `ADMIN_ALLOWLIST` or they are an active member of team `GITHUB_TEAM` in organisation `GITHUB_ORG`. Anyone else gets a plain 403 page that shows no reports, counts or statuses. That page, the other sign-in failure pages (a bad state, GitHub not answering) and the stylesheet they share, `/admin/style.css`, are the only pages the service renders itself, because they appear before any session exists.

A signed-in browser holds one cookie, `admin_session`, that is `HttpOnly`, `Secure` and `SameSite=Lax`. It holds only the login and an expiry eight hours ahead, signed with HMAC-SHA256 under `ADMIN_SESSION_KEY`. Both writes of the JSON API also carry a CSRF token derived from that cookie. Tokens, secrets and cookies are never logged.

## Health check

`GET /admin/health` answers 200 with an empty body and needs no sign-in, and `omnileaf-admin health` requests it on `ADMIN_LISTEN` (`127.0.0.1:8080` by default) and exits 0 only on a 200, so a container can use it as its health check.

## Settings

All settings are environment variables.

| Variable | Meaning |
| --- | --- |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | The GitHub OAuth app. |
| `GITHUB_ORG`, `GITHUB_TEAM` | The team whose active members may sign in. |
| `ADMIN_ALLOWLIST` | Logins, separated by commas, that may sign in without being on the team. |
| `ADMIN_SESSION_KEY` | At least 32 characters; signs cookies. |
| `ADMIN_RELAY_URL` | Base URL of the relay's private listener, such as `http://relay.test:9090`. |
| `ADMIN_RELAY_TOKEN` | Bearer token the relay expects. |
| `ADMIN_LISTEN` | Address to listen on, `0.0.0.0:8080` by default for `serve`. |
| `ADMIN_STATIC_DIR` | Folder holding the built interface, with an `index.html`; the container image builds it into `/ui` and sets this to `/ui`. Without it every page answers `404` and only sign-in and the API work. The service refuses to start when it is set and unreadable. |
| `ADMIN_GITHUB_API_URL`, `ADMIN_GITHUB_AUTH_URL` | GitHub's API and sign-in hosts, which tests point at a fake. |

## Serving the interface

When `ADMIN_STATIC_DIR` is set, its files are read into memory at start and served under `/admin/` to signed-in visitors only; anyone else is sent to sign-in, so no file is public. Files are matched by exact name, links are skipped, and a file or folder name with any character other than ASCII letters, digits and `-._~!$&'()*+,;=:@[]` stops the service from starting, so nothing outside the folder can be read and no file is silently unreachable. `/admin` and every path below it that is not a route of this service (sign-in, health, the stylesheet and the JSON API) is looked up in that folder. On such a path, only `GET` and `HEAD` are answered. A path without a file extension that is not a file or a page of this service answers `index.html`, so the app can route it; a missing file with an extension is a `404`. Files under `_app/immutable/` are cached for a year with `private, immutable`; everything else, including every page and API answer, is `no-store`.

Every answer carries `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-hashes' 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`, so scripts, styles, fonts, requests and the manifest may only come from this origin, images from this origin or `data:`, and nothing inline runs. The one inline style allowed is the hidden route announcer that SvelteKit adds to every page: its `style` attribute is allowed by the hash of its exact text, so any other inline style is still blocked. The other exception is the inline scripts of `index.html` itself, which a SvelteKit build needs to start: at start-up the service reads the script tags of `index.html` by the common HTML rules (comments are skipped, quoted attribute values may hold a `>`, and line endings are read as line feeds) and hashes every one without a `src`, data blocks included. It is not a full HTML parser, so an unusual file can leave its real script unhashed, which the browser then blocks; a build from SvelteKit does not. Only the answers that carry `index.html` allow those exact `sha256` hashes in `script-src`, so a changed or added script is blocked. A file that is not text, a comment, a script tag or a script that is never closed stops the service from starting.

## Relay admin API

Every request carries `Authorization: Bearer <ADMIN_RELAY_TOKEN>`. Status changes also carry `X-Admin-Actor: <github login>`.

- `GET /admin/v1/reports?status=<received|reviewing|published|duplicate|closed>&limit=<n>` returns an array of `{code, receivedAt, status: {kind, issue?}, platform, version}`, with `receivedAt` in unix seconds.
- `GET /admin/v1/reports/{code}` returns `{listed, report, replyAddress}`, where `listed` has the fields above, `report` is a string or null, and `replyAddress` is always null unless the query has `replyAddress=true`.
- `POST /admin/v1/reports/{code}/status` takes `{status: reviewing|published|duplicate|closed, issue?: number}` and returns `{result: changed|notFound|refused, from?: kind}`.
- `GET /admin/v1/reports/{code}/export` returns `{result: ready|notFound|purged, body?: string}`.
- `GET /admin/v1/reports/{code}/audit` returns an array, newest first, of `{previous, status: {kind, issue?}, actor, at}`.

## Admin JSON API

The interface reads and writes through JSON under `/admin/api/`. Every route needs the session cookie and answers `401` with `{"error":"signedOut"}` instead of redirecting to sign-in. Other failures are `{"error":"notFound"}` (404, also for an unknown path or a malformed code), `{"error":"methodNotAllowed"}` (405), `{"error":"relayUnavailable"}` (502), and the ones the writes below add. Answers carry the security headers of every other answer, and a reply address is never requested or returned.

- `GET /admin/api/session` returns `{login, csrf}`.
- `GET /admin/api/reports` returns `{reports, truncated}`: the newest 500 reports, newest first, each `{code, receivedAt, status: {kind, issue?}, platform, version}`. `truncated` is true when the relay may hold more.
- `GET /admin/api/reports/{code}` returns `{listed, report, audit}`. `report` is null once its text has been purged, and `audit` is newest first.
- `GET /admin/api/reports/{code}/issue` returns `{result: "ready", body}` or `{result: "purged"}`.
- `POST /admin/api/reports/{code}/status` moves a report. The body is `{status, issue?}` with `status` one of `reviewing`, `published`, `duplicate` or `closed`, and `published` and `duplicate` need a positive `issue` number. It answers `{result: "changed"}`.
- `POST /admin/api/logout` clears the session cookie and answers `204`.

Both writes need the token from `GET /admin/api/session` in an `X-CSRF-Token` header, checked before anything else. A missing or wrong token is `403` `{"error":"csrfRejected"}`. A body that is not a move is `400` `{"error":"badRequest"}`, a move without its issue number is `400` `{"error":"issueRequired"}`, and a move the relay refuses is `409` `{"error":"refused","from":"<current status>"}`.

The JSON files in `crates/omnileaf-admin/tests/fixtures/` pin the read shapes.

## Browser check

`cargo run -p omnileaf-admin --example preview -- 127.0.0.1:4180` serves the service against a built-in fake relay and fake GitHub with sample reports of every status, including published and duplicate reports with an issue number and one whose text was purged. Set `ADMIN_STATIC_DIR=admin-ui/build` to serve the interface, after building it with `pnpm --dir admin-ui build`. The fake GitHub signs a visitor in as `reviewer`, who is allowed, and a sign-in as any other login gets the 403 page. The fake relay refuses every status change and always returns a reply address, so an answer or screen that showed it would be caught. `pnpm --dir app test:admin` starts the example and drives the interface in a browser, so build the interface first. It checks accessibility, sideways overflow, target size, the focus outline and the reply address on every screen in light and dark at 360 and 1280 pixels wide, checks the key screens again at 360 with every letter spaced wider so that wider text is less likely to push anything sideways out of its box, walks the dashboard and the reports list, including the search box, which it also runs in WebKit, and the report page in each status, every status change and each way it fails, and it checks the policy the answers carry. The example is not built into the image.
