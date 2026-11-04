use axum::http::{StatusCode, header};

use super::support::{Harness, Site};

const SHELL: &str = "<!doctype html><title>Admin</title>";
const CODE: &str = "R-1234-5678";
const PAGES: [&str; 5] = [
    "/admin",
    "/admin/",
    "/admin/reports/R-1234-5678",
    "/admin/reports/R-1234-5678/audit",
    "/admin/reports/R-1234-5678/issue",
];

fn site() -> Site {
    Site::with(&[("index.html", SHELL)])
}

#[tokio::test]
async fn every_page_serves_the_shell_to_a_signed_in_visitor() {
    let site = site();
    let harness = Harness::start_serving(&["alice"], Some(&site)).await;
    let cookie = harness.sign_in("alice").await;
    for path in PAGES {
        let reply = harness.get(path, Some(&cookie)).await;
        assert_eq!(reply.status, StatusCode::OK, "{path}");
        assert_eq!(reply.body, SHELL, "{path}");
        assert_eq!(reply.headers[header::CACHE_CONTROL], "no-store", "{path}");
    }
    assert!(harness.relay.requests().is_empty());
}

#[tokio::test]
async fn a_visitor_without_a_valid_session_is_sent_to_sign_in_from_every_page() {
    let site = site();
    let harness = Harness::start_serving(&["alice"], Some(&site)).await;
    let signed_in = harness.sign_in("alice").await;
    let forged = format!("{signed_in}x");
    harness.advance(8 * 60 * 60);
    for cookie in [None, Some(forged.as_str()), Some(signed_in.as_str())] {
        for path in PAGES {
            let reply = harness.get(path, cookie).await;
            assert_eq!(reply.status, StatusCode::SEE_OTHER, "{path} {cookie:?}");
            assert_eq!(reply.location(), "/admin/login", "{path} {cookie:?}");
            assert!(!reply.body.contains("Admin"), "{path} {cookie:?}");
        }
    }
    assert!(harness.relay.requests().is_empty());
}

#[tokio::test]
async fn a_path_that_only_starts_like_the_interface_is_not_served() {
    let site = site();
    let harness = Harness::start_serving(&["alice"], Some(&site)).await;
    let cookie = harness.sign_in("alice").await;
    let reply = harness.get("/adminreports", Some(&cookie)).await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn the_post_routes_of_the_removed_pages_are_refused_with_or_without_an_interface() {
    let site = site();
    let with = Harness::start_serving(&["alice"], Some(&site)).await;
    let without = Harness::start(&["alice"]).await;
    for harness in [&with, &without] {
        let cookie = harness.sign_in("alice").await;
        for path in [
            format!("/admin/reports/{CODE}/status"),
            "/admin/logout".to_owned(),
            "/admin".to_owned(),
        ] {
            for session in [None, Some(cookie.as_str())] {
                let reply = harness
                    .post_form(&path, session, "csrf=x&status=closed")
                    .await;
                assert_eq!(reply.status, StatusCode::METHOD_NOT_ALLOWED, "{path}");
                assert!(reply.cookie_line("admin_session").is_none(), "{path}");
            }
        }
        assert!(harness.relay.posts().is_empty());
    }
}
