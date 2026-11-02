use axum::{
    Form,
    extract::{Path, State},
    http::StatusCode,
    response::{Html, IntoResponse, Redirect, Response},
};
use maud::html;
use serde::Deserialize;

use crate::{
    AppState,
    auth::Session,
    page::{layout, notice},
    relay::{Export, StatusChange},
    review::{code_of, relay_unavailable, report_not_found, show_report, signed_in},
};

const MOVES: [&str; 4] = ["reviewing", "published", "duplicate", "closed"];

#[derive(Deserialize)]
pub(crate) struct MoveForm {
    csrf: Option<String>,
    status: Option<String>,
    issue: Option<String>,
}

fn issue_number(text: &str) -> Option<u64> {
    text.trim().parse().ok().filter(|number| *number > 0)
}

pub(crate) async fn change_status(
    State(state): State<AppState>,
    session: Session,
    Path(code): Path<String>,
    Form(form): Form<MoveForm>,
) -> Response {
    if !form
        .csrf
        .as_deref()
        .is_some_and(|token| session.csrf_matches(&state, token))
    {
        return notice(
            StatusCode::FORBIDDEN,
            "Refused",
            "The form was not made for this session.",
        );
    }
    let Some(code) = code_of(code) else {
        return report_not_found();
    };
    let Some(status) = form
        .status
        .as_deref()
        .filter(|status| MOVES.contains(status))
    else {
        return notice(
            StatusCode::BAD_REQUEST,
            "Unknown status",
            "Choose one of the buttons.",
        );
    };
    let needs_issue = matches!(status, "published" | "duplicate");
    let issue = form.issue.as_deref().and_then(issue_number);
    if needs_issue && issue.is_none() {
        let message = format!("Enter the issue number to mark this report {status}.");
        return show_report(
            &state,
            &session,
            &code,
            StatusCode::BAD_REQUEST,
            Some(&message),
        )
        .await;
    }
    let issue = if needs_issue { issue } else { None };
    match state
        .relay
        .change_status(&code, status, issue, &session.login)
        .await
    {
        Ok(StatusChange::Changed) => {
            Redirect::to(&format!("/admin/reports/{code}")).into_response()
        }
        Ok(StatusChange::NotFound) => report_not_found(),
        Ok(StatusChange::Refused { from }) => {
            let message = format!("A {from} report cannot be moved to {status}.");
            show_report(
                &state,
                &session,
                &code,
                StatusCode::CONFLICT,
                Some(&message),
            )
            .await
        }
        Err(error) => relay_unavailable(error),
    }
}

pub(crate) async fn public_issue(
    State(state): State<AppState>,
    session: Session,
    Path(code): Path<String>,
) -> Response {
    let Some(code) = code_of(code) else {
        return report_not_found();
    };
    let body = match state.relay.export(&code).await {
        Ok(Export::Ready(body)) => body,
        Ok(Export::NotFound) => return report_not_found(),
        Ok(Export::Purged) => {
            return notice(
                StatusCode::GONE,
                "Nothing to copy",
                "This report's text has been purged, so there is no issue text to copy.",
            );
        }
        Err(error) => return relay_unavailable(error),
    };
    let content = html! {
        h1 { "Copy " (code) " as a public issue" }
        p { "Select all of the text below and paste it into a new issue." }
        label for="issue-text" { "Public issue text" }
        textarea id="issue-text" readonly rows="18" { (body) }
        nav class="actions" aria-label="Report views" {
            a href={ "/admin/reports/" (code) } { "Back to the report" }
        }
    };
    let page = layout(
        "Copy as public issue",
        Some(&signed_in(&state, &session)),
        &content,
    );
    Html(page.into_string()).into_response()
}
