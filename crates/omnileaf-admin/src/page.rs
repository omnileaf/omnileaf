use axum::{
    http::{StatusCode, header},
    response::{Html, IntoResponse, Response},
};
use maud::{DOCTYPE, Markup, html};

pub(crate) const STYLESHEET: &str = include_str!("style.css");
pub(crate) const NO_STORE: &str = "no-store";
const POLICY: &str = "default-src 'none'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-hashes' 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

fn layout(title: &str, content: &Markup) -> Markup {
    html! {
        (DOCTYPE)
        html lang="en" {
            head {
                meta charset="utf-8";
                meta name="viewport" content="width=device-width, initial-scale=1";
                meta name="color-scheme" content="light dark";
                title { (title) " - Omnileaf reports" }
                link rel="stylesheet" href="/admin/style.css";
            }
            body {
                header class="bar" {
                    a class="brand" href="/admin" { "Omnileaf reports" }
                }
                main id="main" { (content) }
            }
        }
    }
}

pub(crate) fn notice(status: StatusCode, title: &str, message: &str) -> Response {
    let markup = layout(
        title,
        &html! {
            h1 { (title) }
            p { (message) }
        },
    );
    (status, Html(markup.into_string())).into_response()
}

pub(crate) fn stylesheet() -> Response {
    (
        [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
        STYLESHEET,
    )
        .into_response()
}

pub(crate) fn hardened(mut response: Response) -> Response {
    let headers = response.headers_mut();
    for (name, value) in [
        (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        (header::REFERRER_POLICY, "no-referrer"),
        (header::X_FRAME_OPTIONS, "DENY"),
    ] {
        headers.insert(name, header::HeaderValue::from_static(value));
    }
    headers
        .entry(header::CACHE_CONTROL)
        .or_insert(header::HeaderValue::from_static(NO_STORE));
    headers
        .entry(header::CONTENT_SECURITY_POLICY)
        .or_insert(header::HeaderValue::from_static(POLICY));
    response
}

pub(crate) fn policy_allowing_scripts(digests: &[String]) -> anyhow::Result<header::HeaderValue> {
    let sources = digests
        .iter()
        .map(|digest| format!("'sha256-{digest}'"))
        .collect::<Vec<_>>()
        .join(" ");
    Ok(header::HeaderValue::from_str(&POLICY.replacen(
        "script-src 'self'",
        &format!("script-src 'self' {sources}"),
        1,
    ))?)
}
