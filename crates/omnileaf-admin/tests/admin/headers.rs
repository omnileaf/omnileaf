use axum::http::header;

use super::support::seeded;

const PATHS: [&str; 6] = [
    "/admin/api/session",
    "/admin/health",
    "/admin",
    "/admin/login",
    "/admin/style.css",
    "/admin/nothing-here",
];

#[tokio::test]
async fn the_policy_lets_the_interface_load_from_its_own_origin_only() {
    let (harness, cookie) = seeded().await;
    let policy = "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-hashes' 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='; img-src 'self' data:; \
                  font-src 'self'; connect-src 'self'; manifest-src 'self'; form-action 'self'; frame-ancestors 'none'; \
                  base-uri 'none'";
    for path in PATHS {
        let reply = harness.get(path, Some(&cookie)).await;
        assert_eq!(
            reply.headers[header::CONTENT_SECURITY_POLICY],
            policy,
            "{path}"
        );
        assert_eq!(
            reply.headers[header::X_CONTENT_TYPE_OPTIONS],
            "nosniff",
            "{path}"
        );
        assert_eq!(reply.headers[header::X_FRAME_OPTIONS], "DENY", "{path}");
        assert_eq!(
            reply.headers[header::REFERRER_POLICY],
            "no-referrer",
            "{path}"
        );
    }
}

#[tokio::test]
async fn pages_and_the_api_are_never_cached() {
    let (harness, cookie) = seeded().await;
    for path in PATHS {
        let reply = harness.get(path, Some(&cookie)).await;
        assert_eq!(reply.headers[header::CACHE_CONTROL], "no-store", "{path}");
    }
}
