use axum::http::{StatusCode, header};

use super::support::{Harness, Site};

const SHELL: &str = "<!doctype html><title>Admin</title>";
const SCRIPT: &str = "export const app = 1;";
const HASHED_SCRIPT: &str = "/admin/_app/immutable/entry/app.abc123.js";

fn site() -> Site {
    let site = Site::with(&[
        ("index.html", SHELL),
        ("_app/immutable/entry/app.abc123.js", SCRIPT),
        ("_app/immutable/assets/app.abc123.css", "body{margin:0}"),
        ("favicon.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>"),
        ("robots.txt", "User-agent: *"),
    ]);
    site.beside("secret.txt", "outside the interface");
    site
}

async fn serving(site: &Site) -> (Harness, String) {
    let harness = Harness::start_serving(&["alice"], Some(site)).await;
    let cookie = harness.sign_in("alice").await;
    (harness, cookie)
}

#[tokio::test]
async fn a_visitor_without_a_session_is_sent_to_sign_in_for_every_file() {
    let site = site();
    let (harness, _) = serving(&site).await;
    for path in [
        HASHED_SCRIPT,
        "/admin/index.html",
        "/admin/dashboard",
        "/admin/missing.png",
    ] {
        let reply = harness.get(path, None).await;
        assert_eq!(reply.status, StatusCode::SEE_OTHER, "{path}");
        assert_eq!(reply.location(), "/admin/login", "{path}");
        assert!(!reply.body.contains(SCRIPT), "{path}");
        assert!(!reply.body.contains("Admin"), "{path}");
    }
}

#[tokio::test]
async fn a_hashed_file_is_served_with_its_type_and_a_private_immutable_cache() {
    let site = site();
    let (harness, cookie) = serving(&site).await;
    let reply = harness.get(HASHED_SCRIPT, Some(&cookie)).await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.body, SCRIPT);
    assert_eq!(
        reply.headers[header::CONTENT_TYPE],
        "text/javascript; charset=utf-8"
    );
    assert_eq!(
        reply.headers[header::CACHE_CONTROL],
        "private, max-age=31536000, immutable"
    );
}

#[tokio::test]
async fn other_files_are_served_with_their_type_and_never_cached() {
    let site = site();
    let (harness, cookie) = serving(&site).await;
    for (path, content_type) in [
        ("/admin/index.html", "text/html; charset=utf-8"),
        ("/admin/favicon.svg", "image/svg+xml"),
        ("/admin/robots.txt", "text/plain; charset=utf-8"),
        (
            "/admin/_app/immutable/assets/app.abc123.css",
            "text/css; charset=utf-8",
        ),
    ] {
        let reply = harness.get(path, Some(&cookie)).await;
        assert_eq!(reply.status, StatusCode::OK, "{path}");
        assert_eq!(reply.headers[header::CONTENT_TYPE], content_type, "{path}");
        let cache = reply.headers[header::CACHE_CONTROL].to_str().unwrap();
        if path.contains("immutable") {
            assert!(cache.contains("immutable"), "{path}");
        } else {
            assert_eq!(cache, "no-store", "{path}");
        }
    }
}

#[tokio::test]
async fn an_unknown_page_gets_the_shell_so_the_app_can_route_it() {
    let site = site();
    let (harness, cookie) = serving(&site).await;
    for path in ["/admin/dashboard", "/admin/search/open", "/admin/"] {
        let reply = harness.get(path, Some(&cookie)).await;
        assert_eq!(reply.status, StatusCode::OK, "{path}");
        assert_eq!(reply.body, SHELL, "{path}");
        assert_eq!(reply.headers[header::CACHE_CONTROL], "no-store", "{path}");
    }
}

#[tokio::test]
async fn a_missing_file_is_a_404_not_the_shell() {
    let site = site();
    let (harness, cookie) = serving(&site).await;
    for path in [
        "/admin/_app/immutable/entry/app.gone.js",
        "/admin/missing.png",
    ] {
        let reply = harness.get(path, Some(&cookie)).await;
        assert_eq!(reply.status, StatusCode::NOT_FOUND, "{path}");
        assert!(!reply.body.contains("Admin"), "{path}");
    }
}

#[tokio::test]
async fn an_unknown_api_path_stays_a_json_404() {
    let site = site();
    let (harness, cookie) = serving(&site).await;
    let reply = harness.get("/admin/api/nope", Some(&cookie)).await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
    assert_eq!(reply.headers[header::CONTENT_TYPE], "application/json");
}

#[tokio::test]
async fn nothing_outside_the_interface_can_be_read() {
    let site = site();
    let (harness, cookie) = serving(&site).await;
    for path in [
        "/admin/..%2Fsecret.txt",
        "/admin/%2e%2e/secret.txt",
        "/admin/../secret.txt",
        "/admin/_app/..%2F..%2Fsecret.txt",
    ] {
        let reply = harness.get(path, Some(&cookie)).await;
        assert!(!reply.body.contains("outside the interface"), "{path}");
        assert_ne!(reply.status, StatusCode::OK, "{path}");
    }
}

#[cfg(unix)]
#[tokio::test]
async fn a_link_to_a_file_outside_the_interface_is_not_served() {
    let site = site();
    site.link("leak.txt", "secret.txt");
    let (harness, cookie) = serving(&site).await;
    let reply = harness.get("/admin/leak.txt", Some(&cookie)).await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
    assert!(!reply.body.contains("outside the interface"));
}

#[tokio::test]
async fn without_an_interface_an_unknown_path_is_a_404_for_everyone() {
    let harness = Harness::start(&["alice"]).await;
    let cookie = harness.sign_in("alice").await;
    for session in [None, Some(cookie.as_str())] {
        let reply = harness.get("/admin/dashboard", session).await;
        assert_eq!(reply.status, StatusCode::NOT_FOUND);
    }
}

#[tokio::test]
async fn a_served_file_carries_the_same_policy_as_the_pages() {
    let site = site();
    let (harness, cookie) = serving(&site).await;
    let page = harness.get("/admin", Some(&cookie)).await;
    let file = harness.get(HASHED_SCRIPT, Some(&cookie)).await;
    assert_eq!(
        file.headers[header::CONTENT_SECURITY_POLICY],
        page.headers[header::CONTENT_SECURITY_POLICY]
    );
    assert_eq!(file.headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
}

#[tokio::test]
async fn only_reading_is_allowed_on_an_unknown_path() {
    let site = site();
    let (harness, cookie) = serving(&site).await;
    for path in ["/admin/dashboard", "/admin/index.html"] {
        for session in [None, Some(cookie.as_str())] {
            let reply = harness.post_form(path, session, "").await;
            assert_eq!(reply.status, StatusCode::METHOD_NOT_ALLOWED, "{path}");
            assert_eq!(reply.headers[header::ALLOW], "GET,HEAD", "{path}");
            assert_eq!(reply.headers[header::CACHE_CONTROL], "no-store", "{path}");
            assert!(
                reply.headers.contains_key(header::CONTENT_SECURITY_POLICY),
                "{path}"
            );
            assert!(reply.body.is_empty(), "{path}");
        }
    }
}

#[tokio::test]
async fn without_an_interface_a_post_to_an_unknown_path_is_a_405() {
    let harness = Harness::start(&["alice"]).await;
    let cookie = harness.sign_in("alice").await;
    for session in [None, Some(cookie.as_str())] {
        let reply = harness.post_form("/admin/dashboard", session, "").await;
        assert_eq!(reply.status, StatusCode::METHOD_NOT_ALLOWED);
    }
}

#[tokio::test]
async fn a_head_request_has_the_headers_and_no_body() {
    let site = site();
    let (harness, cookie) = serving(&site).await;
    let request = axum::http::Request::head(HASHED_SCRIPT)
        .header(header::COOKIE, &cookie)
        .body(axum::body::Body::empty())
        .unwrap();
    let reply = harness.send(request).await;
    assert_eq!(reply.status, StatusCode::OK);
    assert!(reply.body.is_empty());
    assert_eq!(
        reply.headers[header::CONTENT_TYPE],
        "text/javascript; charset=utf-8"
    );
}

#[tokio::test]
async fn pages_of_the_service_win_over_files_of_the_same_name() {
    let site = Site::with(&[
        ("index.html", SHELL),
        ("login", "a file named login"),
        ("style.css", "a file named style"),
        ("health", "a file named health"),
    ]);
    let (harness, cookie) = serving(&site).await;
    let login = harness.get("/admin/login", None).await;
    assert_eq!(login.status, StatusCode::SEE_OTHER);
    assert!(login.location().starts_with("http"));
    let style = harness.get("/admin/style.css", Some(&cookie)).await;
    assert!(!style.body.contains("a file named"));
    let health = harness.get("/admin/health", None).await;
    assert_eq!(health.status, StatusCode::OK);
    assert!(health.body.is_empty());
}

#[tokio::test]
async fn every_kind_of_file_a_build_ships_has_its_type() {
    let files = [
        ("a.mjs", "text/javascript; charset=utf-8"),
        ("a.json", "application/json"),
        ("a.map", "application/json"),
        ("a.webmanifest", "application/manifest+json"),
        ("a.xml", "application/xml"),
        ("a.png", "image/png"),
        ("a.jpg", "image/jpeg"),
        ("a.jpeg", "image/jpeg"),
        ("a.gif", "image/gif"),
        ("a.webp", "image/webp"),
        ("a.avif", "image/avif"),
        ("a.ico", "image/x-icon"),
        ("a.woff", "font/woff"),
        ("a.woff2", "font/woff2"),
        ("a.bin", "application/octet-stream"),
        (".well-known/note.txt", "text/plain; charset=utf-8"),
        ("empty.txt", "text/plain; charset=utf-8"),
    ];
    let mut contents = vec![("index.html", SHELL)];
    contents.extend(files.iter().map(|(name, _)| (*name, "x")));
    let site = Site::with(&contents);
    let (harness, cookie) = serving(&site).await;
    for (name, content_type) in files {
        let reply = harness.get(&format!("/admin/{name}"), Some(&cookie)).await;
        assert_eq!(reply.status, StatusCode::OK, "{name}");
        assert_eq!(reply.headers[header::CONTENT_TYPE], content_type, "{name}");
    }
}

#[cfg(unix)]
#[tokio::test]
async fn a_linked_folder_is_not_served() {
    let site = site();
    site.beside("elsewhere/inner.txt", "inside a linked folder");
    site.link("linked", "elsewhere");
    let (harness, cookie) = serving(&site).await;
    let reply = harness.get("/admin/linked/inner.txt", Some(&cookie)).await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
}

async fn start_up_error(site: &Site) -> String {
    match Harness::try_start_serving(&["alice"], Some(site)).await {
        Ok(_) => "start-up succeeded".to_owned(),
        Err(error) => format!("{error:#}"),
    }
}

#[tokio::test]
async fn a_folder_that_cannot_be_read_stops_start_up() {
    let missing = Site::with(&[("index.html", SHELL)]);
    std::fs::remove_dir_all(missing.outside("ui")).unwrap();
    let error = start_up_error(&missing).await;
    assert!(error.contains("load ADMIN_STATIC_DIR"), "{error}");
    assert!(error.contains("read "), "{error}");
}

#[tokio::test]
async fn a_folder_without_the_shell_stops_start_up() {
    let site = Site::with(&[("app.js", SCRIPT)]);
    let error = start_up_error(&site).await;
    assert!(error.contains("no index.html"), "{error}");
}

#[tokio::test]
async fn a_name_with_a_character_that_needs_escaping_stops_start_up() {
    for name in ["my logo.png", "caf\u{e9}.svg", "dir name/a.js"] {
        let site = Site::with(&[("index.html", SHELL), (name, "x")]);
        let error = start_up_error(&site).await;
        assert!(
            error.contains("other than letters, digits"),
            "{name}: {error}"
        );
    }
}

#[tokio::test]
async fn every_character_a_browser_sends_raw_in_a_name_is_served() {
    let names: Vec<String> = "-._~!$&'()*+,;=:@[]"
        .chars()
        .map(|character| format!("a{character}b.txt"))
        .collect();
    let mut files = vec![("index.html", SHELL)];
    files.extend(names.iter().map(|name| (name.as_str(), "x")));
    let site = Site::with(&files);
    let (harness, cookie) = serving(&site).await;
    for name in names {
        let reply = harness.get(&format!("/admin/{name}"), Some(&cookie)).await;
        assert_eq!(reply.status, StatusCode::OK, "{name}");
        assert_eq!(reply.body, "x", "{name}");
    }
}

#[cfg(unix)]
#[tokio::test]
async fn a_link_with_an_odd_name_is_skipped_not_fatal() {
    let site = site();
    site.link("my link", "secret.txt");
    let (harness, cookie) = serving(&site).await;
    let reply = harness.get("/admin/robots.txt", Some(&cookie)).await;
    assert_eq!(reply.status, StatusCode::OK);
}
