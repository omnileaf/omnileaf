# omnileaf-admin

The review dashboard for problem reports, served at `omnileaf.app/admin`. It is a separate service from the relay and reaches it only through the relay's private admin API. Pages are rendered on the server in Rust, with no JavaScript.

## Sign-in

`GET /admin/login` sends the visitor to GitHub's OAuth web flow with the `read:org` scope and a random state that comes back in a signed cookie lasting ten minutes. `GET /admin/auth/callback` checks that state, exchanges the code, reads the person's login, and lets them in only when the login is on `ADMIN_ALLOWLIST` or they are an active member of team `GITHUB_TEAM` in organisation `GITHUB_ORG`. Anyone else gets a plain 403 page that shows no reports, counts or statuses.

A signed-in browser holds one cookie, `admin_session`, that is `HttpOnly`, `Secure` and `SameSite=Lax`. It holds only the login and an expiry eight hours ahead, signed with HMAC-SHA256 under `ADMIN_SESSION_KEY`. Every `POST` also carries a CSRF token derived from that cookie. Tokens, secrets and cookies are never logged.

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
| `ADMIN_GITHUB_API_URL`, `ADMIN_GITHUB_AUTH_URL` | GitHub's API and sign-in hosts, which tests point at a fake. |

## Relay admin API

Every request carries `Authorization: Bearer <ADMIN_RELAY_TOKEN>`. Status changes also carry `X-Admin-Actor: <github login>`.

- `GET /admin/v1/reports?status=<received|reviewing|published|duplicate|closed>&limit=<n>` returns an array of `{code, receivedAt, status: {kind, issue?}, platform, version}`, with `receivedAt` in unix seconds.
- `GET /admin/v1/reports/{code}` returns `{listed, report, replyAddress}`, where `listed` has the fields above, `report` is a string or null, and `replyAddress` is always null unless the query has `replyAddress=true`.
- `POST /admin/v1/reports/{code}/status` takes `{status: reviewing|published|duplicate|closed, issue?: number}` and returns `{result: changed|notFound|refused, from?: kind}`.
- `GET /admin/v1/reports/{code}/export` returns `{result: ready|notFound|purged, body?: string}`.
- `GET /admin/v1/reports/{code}/audit` returns an array, newest first, of `{previous, status: {kind, issue?}, actor, at}`.

## Admin JSON API

The pages' data is also served as JSON under `/admin/api/`. Every route needs the session cookie and answers `401` with `{"error":"signedOut"}` instead of redirecting to sign-in. Other failures are `{"error":"notFound"}` (404, also for an unknown path or a malformed code), `{"error":"methodNotAllowed"}` (405), `{"error":"relayUnavailable"}` (502), and the ones the writes below add. Answers carry the same security headers as the pages, and a reply address is never requested or returned.

- `GET /admin/api/session` returns `{login, csrf}`.
- `GET /admin/api/reports` returns `{reports, truncated}`: the newest 500 reports, newest first, each `{code, receivedAt, status: {kind, issue?}, platform, version}`. `truncated` is true when the relay may hold more.
- `GET /admin/api/reports/{code}` returns `{listed, report, audit}`. `report` is null once its text has been purged, and `audit` is newest first.
- `GET /admin/api/reports/{code}/issue` returns `{result: "ready", body}` or `{result: "purged"}`.
- `POST /admin/api/reports/{code}/status` moves a report. The body is `{status, issue?}` with `status` one of `reviewing`, `published`, `duplicate` or `closed`, and `published` and `duplicate` need a positive `issue` number. It answers `{result: "changed"}`.
- `POST /admin/api/logout` clears the session cookie and answers `204`.

Both writes need the token from `GET /admin/api/session` in an `X-CSRF-Token` header, checked before anything else. A missing or wrong token is `403` `{"error":"csrfRejected"}`. A body that is not a move is `400` `{"error":"badRequest"}`, a move without its issue number is `400` `{"error":"issueRequired"}`, and a move the relay refuses is `409` `{"error":"refused","from":"<current status>"}`.

The JSON files in `crates/omnileaf-admin/tests/fixtures/` pin the read shapes.

## Accessibility check

`cargo run -p omnileaf-admin --example preview -- 127.0.0.1:4180` serves the real pages against a built-in fake relay and fake GitHub with sample reports. Signing in as `reviewer` is allowed and any other login gets the 403 page. The fake relay refuses every status change and always returns a reply address, so a page that showed it would be caught. `pnpm --dir app test:admin` starts that example and runs axe, overflow, target size, focus outline and reply address checks on every page in light and dark at 360 and 1280 pixels wide. The example is not built into the image.
