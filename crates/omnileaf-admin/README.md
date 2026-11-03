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
