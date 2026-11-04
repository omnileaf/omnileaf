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

const FORBIDDEN_IN_WINDOWS_FILE_NAMES: [char; 2] = ['*', ':'];

fn can_be_a_file_name_here(character: char) -> bool {
    !(cfg!(windows) && FORBIDDEN_IN_WINDOWS_FILE_NAMES.contains(&character))
}

#[tokio::test]
async fn every_character_a_browser_sends_raw_in_a_name_is_served() {
    let names: Vec<String> = "-._~!$&'()*+,;=:@[]"
        .chars()
        .filter(|character| can_be_a_file_name_here(*character))
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

const BOOTSTRAP: &str = "\n\t{\n\t\t__sveltekit_1ceqy1n = {\n\t\t\tbase: \"/admin\"\n\t\t};\n\t}\n";
const BOOTSTRAP_HASH: &str = "'sha256-Vb4kpYXuCcWK4QAkbi10xn4/OtofkhWR0eksrmhrTYk='";
const ANNOUNCER_STYLE: &str =
    "style-src-attr 'unsafe-hashes' 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo=';";
const SECOND_SCRIPT: &str = "window.second = 1;";
const SECOND_HASH: &str = "'sha256-QjrPuZ0w9ba9oGvN7XsqsGQqJou7P5N6cPhn5S1CtkI='";
const PLAIN_SCRIPTS: &str = "script-src 'self';";

fn shell_with(scripts: &str) -> String {
    format!("<!doctype html><link rel=\"modulepreload\" href=\"/admin/a.js\">{scripts}")
}

async fn policy_of(harness: &Harness, cookie: &str, path: &str) -> String {
    let reply = harness.get(path, Some(cookie)).await;
    reply
        .headers
        .get(header::CONTENT_SECURITY_POLICY)
        .and_then(|policy| policy.to_str().ok())
        .map(str::to_owned)
        .unwrap_or_default()
}

#[tokio::test]
async fn the_shell_allows_its_own_inline_script_by_hash_and_nothing_else_does() {
    let shell = shell_with(&format!("<script>{BOOTSTRAP}</script>"));
    let site = Site::with(&[("index.html", &shell), ("app.js", SCRIPT)]);
    let (harness, cookie) = serving(&site).await;
    for path in ["/admin/index.html", "/admin/dashboard"] {
        let policy = policy_of(&harness, &cookie, path).await;
        assert!(
            policy.contains(&format!("script-src 'self' {BOOTSTRAP_HASH};")),
            "{path}: {policy}"
        );
        assert!(policy.contains(ANNOUNCER_STYLE), "{path}: {policy}");
        assert!(!policy.contains("unsafe-inline"), "{path}: {policy}");
    }
    for path in ["/admin/app.js", "/admin/api/session", "/admin/health"] {
        let policy = policy_of(&harness, &cookie, path).await;
        assert!(policy.contains(PLAIN_SCRIPTS), "{path}: {policy}");
        assert!(!policy.contains(BOOTSTRAP_HASH), "{path}: {policy}");
    }
}

#[tokio::test]
async fn every_inline_script_of_the_shell_is_allowed_by_its_own_hash() {
    let shell = shell_with(&format!(
        "<script>{BOOTSTRAP}</script><script type=\"module\">{SECOND_SCRIPT}</script>"
    ));
    let site = Site::with(&[("index.html", &shell)]);
    let (harness, cookie) = serving(&site).await;
    let policy = policy_of(&harness, &cookie, "/admin/dashboard").await;
    assert!(
        policy.contains(&format!(
            "script-src 'self' {BOOTSTRAP_HASH} {SECOND_HASH};"
        )),
        "{policy}"
    );
}

#[tokio::test]
async fn scripts_loaded_from_files_add_nothing_to_the_policy() {
    let shell =
        shell_with("<script src=\"/admin/a.js\"></script><SCRIPT SRC=\"/admin/b.js\"></SCRIPT>");
    let site = Site::with(&[("index.html", &shell)]);
    let (harness, cookie) = serving(&site).await;
    let policy = policy_of(&harness, &cookie, "/admin/dashboard").await;
    assert!(policy.contains(PLAIN_SCRIPTS), "{policy}");
}

#[tokio::test]
async fn a_script_the_shell_never_closes_stops_start_up() {
    let shell = shell_with("<script>window.open = 1;");
    let site = Site::with(&[("index.html", &shell)]);
    let error = start_up_error(&site).await;
    assert!(error.contains("never closed"), "{error}");
}

const HASH_A: &str = "'sha256-VZrq0IJk1XldOQlxjN0Fq9SVcuhP5VWQ7vMaiKCP3/0='";
const HASH_B: &str = "'sha256-335w5QIVRPSDS77mSp43if68S+gUcN9inK1t2wMyClw='";
const HASH_EMPTY: &str = "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='";
const HASH_CLOSE_LOOKALIKE: &str = "'sha256-fA/03Xivgxz3JeSrY09BZsaaD3+84nNkv947qO8cVas='";
const HASH_NEWLINE_A_NEWLINE: &str = "'sha256-Fl39cvTP4NSkqxnLrlh5xHA7xKric1ocrbVdTFaDVSM='";

#[tokio::test]
async fn the_scanner_hashes_what_a_browser_would_run_and_nothing_else() {
    let cases: [(&str, &str, String); 14] = [
        ("an upper case tag", "<SCRIPT>A</SCRIPT>", HASH_A.to_owned()),
        (
            "an empty script",
            "<script></script>",
            HASH_EMPTY.to_owned(),
        ),
        (
            "a data-src attribute is not a src",
            "<script data-src=\"x\">A</script>",
            HASH_A.to_owned(),
        ),
        (
            "a script and its look-alikes",
            "<scripts>x</scripts><script-x>y</script-x><script>A</script>",
            HASH_A.to_owned(),
        ),
        (
            "a commented out script",
            "<!-- <script>x</script> --><script>A</script>",
            HASH_A.to_owned(),
        ),
        (
            "a space in the end tag",
            "<script>A</script ><script>B</script>",
            format!("{HASH_A} {HASH_B}"),
        ),
        (
            "a greater than sign inside an attribute",
            "<script data-x=\"a>b\">A</script>",
            HASH_A.to_owned(),
        ),
        (
            "a close tag look-alike inside a script",
            "<script>a</scriptx>b</script>",
            HASH_CLOSE_LOOKALIKE.to_owned(),
        ),
        (
            "a single quoted attribute with a greater than sign",
            "<script data-x='a>b'>A</script>",
            HASH_A.to_owned(),
        ),
        (
            "a double quote inside a single quoted attribute",
            "<script data-x='a\"b>c'>A</script>",
            HASH_A.to_owned(),
        ),
        (
            "a slash after the tag name",
            "<script/ data-x=1>A</script>",
            HASH_A.to_owned(),
        ),
        (
            "carriage returns become line feeds",
            "<script>\r\nA\r\n</script>",
            HASH_NEWLINE_A_NEWLINE.to_owned(),
        ),
        (
            "a lone carriage return",
            "<script>\rA\r</script>",
            HASH_NEWLINE_A_NEWLINE.to_owned(),
        ),
        (
            "a script loaded from a file next to an inline one",
            "<script src=\"/admin/a.js\"></script><script>A</script>",
            HASH_A.to_owned(),
        ),
    ];
    for (name, scripts, expected) in cases {
        let shell = shell_with(scripts);
        let site = Site::with(&[("index.html", &shell), ("other.html", &shell)]);
        let (harness, cookie) = serving(&site).await;
        let policy = policy_of(&harness, &cookie, "/admin/dashboard").await;
        assert!(
            policy.contains(&format!("script-src 'self' {expected};")),
            "{name}: {policy}"
        );
        let other = policy_of(&harness, &cookie, "/admin/other.html").await;
        assert!(other.contains(PLAIN_SCRIPTS), "{name}: {other}");
    }
}

#[tokio::test]
async fn a_shell_that_is_not_text_stops_start_up() {
    let site = Site::with(&[("index.html", SHELL)]);
    site.put("index.html", &[0xff, 0xfe, 0x3c]);
    let error = start_up_error(&site).await;
    assert!(error.contains("is not text"), "{error}");
}

#[tokio::test]
async fn a_script_tag_the_shell_never_ends_stops_start_up() {
    let site = Site::with(&[("index.html", "<script src=\"/admin/a.js\"")]);
    let error = start_up_error(&site).await;
    assert!(error.contains("never ends"), "{error}");
}

#[tokio::test]
async fn a_comment_the_shell_never_closes_stops_start_up() {
    let site = Site::with(&[("index.html", "<!-- <script>A</script>")]);
    let error = start_up_error(&site).await;
    assert!(error.contains("comment is never closed"), "{error}");
}
