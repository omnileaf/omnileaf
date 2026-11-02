use axum::{
    http::{StatusCode, header},
    response::{Html, IntoResponse, Response},
};
use maud::{DOCTYPE, Markup, html};

pub(crate) const STYLESHEET: &str = include_str!("style.css");

pub(crate) struct SignedIn {
    pub(crate) login: String,
    pub(crate) csrf: String,
}

pub(crate) fn layout(title: &str, signed_in: Option<&SignedIn>, content: &Markup) -> Markup {
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
                a class="skip" href="#main" { "Skip to main content" }
                header class="bar" {
                    a class="brand" href="/admin" { "Omnileaf reports" }
                    @if let Some(signed_in) = signed_in {
                        form class="account" method="post" action="/admin/logout" {
                            span { "Signed in as " strong { (signed_in.login) } }
                            input type="hidden" name="csrf" value=(signed_in.csrf);
                            button type="submit" { "Sign out" }
                        }
                    }
                }
                main id="main" { (content) }
            }
        }
    }
}

pub(crate) fn notice(status: StatusCode, title: &str, message: &str) -> Response {
    let markup = layout(
        title,
        None,
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
        (header::CACHE_CONTROL, "no-store"),
        (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        (header::REFERRER_POLICY, "no-referrer"),
        (header::X_FRAME_OPTIONS, "DENY"),
        (
            header::CONTENT_SECURITY_POLICY,
            "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        ),
    ] {
        headers.insert(name, header::HeaderValue::from_static(value));
    }
    response
}
