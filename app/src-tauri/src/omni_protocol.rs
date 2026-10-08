//! The `omni` protocol, which hands the webview covers by id so it never reads a file itself.

use omnileaf_engine::{Library, Resource, ResourceRouter};
use tauri::{
    Manager, Runtime, UriSchemeContext, UriSchemeResponder,
    http::{self, HeaderValue, StatusCode, header},
};

pub(crate) const SCHEME: &str = "omni";
const NO_SNIFFING: &str = "nosniff";
const KEEP_FOR_GOOD: &str = "public, max-age=31536000, immutable";
const NOT_STORED: &str = "no-store";

/// Answers off the protocol's thread, since making a thumbnail can take a while, and always answers even if that work panics.
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands protocol requests over by value"
)]
pub(crate) fn answer<R: Runtime>(
    context: UriSchemeContext<'_, R>,
    request: http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = context.app_handle().clone();
    let path = request.uri().path().to_owned();
    let answer = Answer::new(move |response| responder.respond(response));
    tauri::async_runtime::spawn(async move {
        let resource = match (
            app.try_state::<Library>(),
            app.try_state::<ResourceRouter>(),
        ) {
            (Some(library), Some(router)) => router.respond(&library, &path).await,
            (None, _) => {
                tracing::warn!(%path, "answer an omni request before the library opened");
                Resource::Failed
            }
            (Some(_), None) => {
                tracing::warn!(%path, "answer an omni request while the covers aren't running");
                Resource::Failed
            }
        };
        answer.with(resource);
    });
}

type Respond = Box<dyn FnOnce(http::Response<Vec<u8>>) + Send>;

/// Answers its request exactly once, with a failure when the work behind it stops before it finishes.
struct Answer {
    respond: Option<Respond>,
}

impl Answer {
    fn new(respond: impl FnOnce(http::Response<Vec<u8>>) + Send + 'static) -> Self {
        Self {
            respond: Some(Box::new(respond)),
        }
    }

    fn with(mut self, resource: Resource) {
        if let Some(respond) = self.respond.take() {
            respond(http_response(resource));
        }
    }
}

impl Drop for Answer {
    fn drop(&mut self) {
        if let Some(respond) = self.respond.take() {
            tracing::error!("answer an omni request whose work stopped before it finished");
            respond(http_response(Resource::Failed));
        }
    }
}

fn http_response(resource: Resource) -> http::Response<Vec<u8>> {
    let (status, cache_control, content_type, body) = match resource {
        Resource::Immutable { content_type, body } => {
            (StatusCode::OK, KEEP_FOR_GOOD, Some(content_type), body)
        }
        Resource::NotFound => (StatusCode::NOT_FOUND, NOT_STORED, None, Vec::new()),
        Resource::Failed => (
            StatusCode::INTERNAL_SERVER_ERROR,
            NOT_STORED,
            None,
            Vec::new(),
        ),
    };
    let mut response = http::Response::new(body);
    *response.status_mut() = status;
    let headers = response.headers_mut();
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(cache_control),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static(NO_SNIFFING),
    );
    if let Some(content_type) = content_type {
        headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    }
    response
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;

    type SentStatus = Arc<Mutex<Option<StatusCode>>>;

    fn recorder(slot: &SentStatus) -> impl FnOnce(http::Response<Vec<u8>>) + use<> {
        let slot = Arc::clone(slot);
        move |response| *slot.lock().unwrap() = Some(response.status())
    }

    #[test]
    fn answers_with_the_resource_its_work_made() {
        let slot = SentStatus::default();
        let answer = Answer::new(recorder(&slot));

        answer.with(Resource::NotFound);

        assert_eq!(*slot.lock().unwrap(), Some(StatusCode::NOT_FOUND));
    }

    #[test]
    fn answers_a_request_whose_work_stopped_as_a_failure() {
        let slot = SentStatus::default();
        let answer = Answer::new(recorder(&slot));

        drop(answer);

        assert_eq!(
            *slot.lock().unwrap(),
            Some(StatusCode::INTERNAL_SERVER_ERROR)
        );
    }

    fn header_of<'response>(
        response: &'response http::Response<Vec<u8>>,
        name: &header::HeaderName,
    ) -> Option<&'response str> {
        response
            .headers()
            .get(name)
            .and_then(|value| value.to_str().ok())
    }

    #[test]
    fn serves_an_immutable_resource_with_its_type_for_good() {
        let resource = Resource::Immutable {
            content_type: "image/jpeg",
            body: vec![0xFF, 0xD8, 0xFF],
        };

        let response = http_response(resource);

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            header_of(&response, &header::CONTENT_TYPE),
            Some("image/jpeg")
        );
        assert_eq!(
            header_of(&response, &header::CACHE_CONTROL),
            Some("public, max-age=31536000, immutable")
        );
        assert_eq!(
            header_of(&response, &header::X_CONTENT_TYPE_OPTIONS),
            Some("nosniff")
        );
        assert_eq!(response.body(), &[0xFF, 0xD8, 0xFF]);
    }

    #[test]
    fn answers_a_missing_resource_with_nothing_the_webview_keeps() {
        let response = http_response(Resource::NotFound);

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            header_of(&response, &header::CACHE_CONTROL),
            Some("no-store")
        );
        assert_eq!(header_of(&response, &header::CONTENT_TYPE), None);
        assert!(response.body().is_empty());
    }

    #[test]
    fn answers_a_failure_as_a_server_error() {
        let response = http_response(Resource::Failed);

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }
}
