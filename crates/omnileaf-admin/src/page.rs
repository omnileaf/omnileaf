use axum::{
    http::{StatusCode, header},
    response::{Html, IntoResponse, Response},
};
use maud::{DOCTYPE, Markup, html};

pub(crate) fn layout(title: &str, content: &Markup) -> Markup {
    html! {
        (DOCTYPE)
        html lang="en" {
            head {
                meta charset="utf-8";
                meta name="viewport" content="width=device-width, initial-scale=1";
                meta name="color-scheme" content="light dark";
                title { (title) " - Omnileaf reports" }
            }
            body {
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
