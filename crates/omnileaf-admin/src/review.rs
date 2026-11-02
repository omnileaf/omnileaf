use std::collections::BTreeSet;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
};
use maud::{Markup, html};
use omnileaf_relay_proto::{Platform, ReportCode};
use serde::Deserialize;

use crate::{
    AppState,
    auth::Session,
    clock_text::utc_minute,
    page::{SignedIn, layout, notice},
    relay::{AuditEntry, LIST_LIMIT, Listed, RelayError, StatusView},
};

const STATUS_KINDS: [&str; 5] = ["received", "reviewing", "published", "duplicate", "closed"];

#[derive(Deserialize)]
pub(crate) struct ListQuery {
    status: Option<String>,
    platform: Option<String>,
    version: Option<String>,
}

pub(crate) fn signed_in(state: &AppState, session: &Session) -> SignedIn {
    SignedIn {
        login: session.login.clone(),
        csrf: session.csrf_token(state),
    }
}

fn capitalised(text: &str) -> String {
    let mut text = text.to_owned();
    if let Some(first) = text.get_mut(..1) {
        first.make_ascii_uppercase();
    }
    text
}

pub(crate) fn status_label(status: &StatusView) -> String {
    let kind = capitalised(&status.kind);
    match status.issue {
        Some(issue) => format!("{kind}, issue #{issue}"),
        None => kind,
    }
}

pub(crate) fn relay_unavailable(_: RelayError) -> Response {
    notice(
        StatusCode::BAD_GATEWAY,
        "The relay did not answer",
        "Try again in a moment.",
    )
}

pub(crate) fn report_not_found() -> Response {
    notice(
        StatusCode::NOT_FOUND,
        "No such report",
        "There is no report with that code.",
    )
}

pub(crate) fn code_of(text: String) -> Option<ReportCode> {
    ReportCode::try_from(text).ok()
}

fn option(value: &str, label: &str, chosen: &str) -> Markup {
    html! {
        option value=(value) selected[value == chosen] { (label) }
    }
}

fn facts(listed: &Listed) -> Markup {
    html! {
        dl class="facts" {
            div { dt { "Status" } dd { (status_label(&listed.status)) } }
            div { dt { "Platform" } dd { (listed.platform) } }
            div { dt { "Version" } dd { (listed.version) } }
            div { dt { "Received" } dd { (utc_minute(listed.received_at)) } }
        }
    }
}

pub(crate) async fn list(
    State(state): State<AppState>,
    session: Session,
    Query(query): Query<ListQuery>,
) -> Response {
    let status = query
        .status
        .as_deref()
        .filter(|kind| STATUS_KINDS.contains(kind));
    let platform = query
        .platform
        .as_deref()
        .filter(|name| Platform::parse(name).is_some());
    let version = query
        .version
        .as_deref()
        .filter(|version| !version.is_empty());
    let fetched = match state.relay.list(status).await {
        Ok(fetched) => fetched,
        Err(error) => return relay_unavailable(error),
    };
    let versions: BTreeSet<&str> = fetched
        .iter()
        .map(|listed| listed.version.as_str())
        .collect();
    let shown: Vec<&Listed> = fetched
        .iter()
        .filter(|listed| platform.is_none_or(|name| listed.platform == name))
        .filter(|listed| version.is_none_or(|wanted| listed.version == wanted))
        .collect();
    let content = html! {
        h1 { "Reports" }
        form class="filters" method="get" action="/admin" {
            fieldset {
                legend { "Filter reports" }
                div {
                    label for="status" { "Status" }
                    select id="status" name="status" {
                        (option("", "Any status", status.unwrap_or_default()))
                        @for kind in STATUS_KINDS { (option(kind, kind, status.unwrap_or_default())) }
                    }
                }
                div {
                    label for="platform" { "Platform" }
                    select id="platform" name="platform" {
                        (option("", "Any platform", platform.unwrap_or_default()))
                        @for known in Platform::ALL { (option(known.as_str(), known.as_str(), platform.unwrap_or_default())) }
                    }
                }
                div {
                    label for="version" { "App version" }
                    select id="version" name="version" {
                        (option("", "Any version", version.unwrap_or_default()))
                        @for known in &versions { (option(known, known, version.unwrap_or_default())) }
                    }
                }
                button type="submit" { "Apply filters" }
            }
        }
        @if shown.is_empty() {
            p { "No reports match." }
        } @else {
            p class="note" { (shown.len()) " of the newest " (fetched.len()) " reports shown." }
            ul class="reports" {
                @for listed in &shown {
                    li {
                        a href={ "/admin/reports/" (listed.code) } { (listed.code) }
                        (facts(listed))
                    }
                }
            }
        }
        @if fetched.len() >= LIST_LIMIT {
            p class="note" { "Only the newest " (LIST_LIMIT) " reports are listed." }
        }
    };
    let page = layout("Reports", Some(&signed_in(&state, &session)), &content);
    Html(page.into_string()).into_response()
}

fn trail(entries: &[AuditEntry]) -> Markup {
    html! {
        @if entries.is_empty() {
            p { "No status changes yet." }
        } @else {
            div class="table-scroll" {
                table class="trail" {
                    caption class="note" { "Status changes, newest first" }
                    thead { tr { th scope="col" { "When" } th scope="col" { "Who" } th scope="col" { "Change" } } }
                    tbody {
                        @for entry in entries {
                            tr {
                                td { (utc_minute(entry.at)) }
                                td { (entry.actor) }
                                td { (capitalised(&entry.previous)) " to " (status_label(&entry.status)) }
                            }
                        }
                    }
                }
            }
        }
    }
}

pub(crate) async fn detail(
    State(state): State<AppState>,
    session: Session,
    Path(code): Path<String>,
) -> Response {
    let Some(code) = code_of(code) else {
        return report_not_found();
    };
    let shown = match state.relay.detail(&code).await {
        Ok(Some(shown)) => shown,
        Ok(None) => return report_not_found(),
        Err(error) => return relay_unavailable(error),
    };
    let entries = match state.relay.audit(&code).await {
        Ok(entries) => entries,
        Err(error) => return relay_unavailable(error),
    };
    let content = html! {
        h1 { (code) }
        (facts(&shown.listed))
        nav class="actions" aria-label="Report views" {
            a href={ "/admin/reports/" (code) "/audit" } { "Audit trail" }
        }
        h2 { "Report" }
        @if let Some(text) = &shown.report {
            pre class="report-text" { (text) }
        } @else {
            p { "The text of this report has been purged." }
        }
        h2 { "Audit trail" }
        (trail(&entries))
    };
    let page = layout(code.as_str(), Some(&signed_in(&state, &session)), &content);
    Html(page.into_string()).into_response()
}

pub(crate) async fn audit(
    State(state): State<AppState>,
    session: Session,
    Path(code): Path<String>,
) -> Response {
    let Some(code) = code_of(code) else {
        return report_not_found();
    };
    let entries = match state.relay.audit(&code).await {
        Ok(entries) => entries,
        Err(error) => return relay_unavailable(error),
    };
    let content = html! {
        h1 { "Audit trail for " (code) }
        (trail(&entries))
        nav class="actions" aria-label="Report views" {
            a href={ "/admin/reports/" (code) } { "Back to the report" }
        }
    };
    let page = layout("Audit trail", Some(&signed_in(&state, &session)), &content);
    Html(page.into_string()).into_response()
}
