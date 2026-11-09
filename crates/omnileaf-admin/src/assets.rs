use std::{collections::HashMap, fs, path::Path};

use anyhow::Context;
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderValue, StatusCode, Uri, header},
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use sha2::{Digest, Sha256};

use crate::{
    AppState,
    auth::Session,
    page::{NO_STORE, policy_allowing_scripts},
};

const ROOT: &str = "/admin";
const SCRIPT_OPEN: &str = "<script";
const SCRIPT_CLOSE: &str = "</script";
const COMMENT_OPEN: &str = "<!--";
const COMMENT_CLOSE: &str = "-->";
const SHELL: &str = "index.html";
const IMMUTABLE_DIRECTORY: &str = "_app/immutable/";
const IMMUTABLE_CACHE: &str = "private, max-age=31536000, immutable";

struct Asset {
    bytes: Bytes,
    content_type: &'static str,
    immutable: bool,
    policy: Option<HeaderValue>,
}

impl Asset {
    fn respond(&self) -> Response {
        let cache = if self.immutable {
            IMMUTABLE_CACHE
        } else {
            NO_STORE
        };
        let mut response = (
            [
                (header::CONTENT_TYPE, self.content_type),
                (header::CACHE_CONTROL, cache),
            ],
            self.bytes.clone(),
        )
            .into_response();
        if let Some(policy) = &self.policy {
            response
                .headers_mut()
                .insert(header::CONTENT_SECURITY_POLICY, policy.clone());
        }
        response
    }
}

pub(crate) struct Assets {
    files: HashMap<String, Asset>,
}

impl Assets {
    pub(crate) fn load(directory: &Path) -> anyhow::Result<Self> {
        let mut files = HashMap::new();
        collect(directory, "", &mut files)?;
        let shell = files
            .get_mut(SHELL)
            .with_context(|| format!("no {SHELL} in {}", directory.display()))?;
        shell.policy =
            allow_inline_scripts(&shell.bytes).context("read the inline scripts of index.html")?;
        Ok(Self { files })
    }

    fn find(&self, path: &str) -> Option<&Asset> {
        self.files.get(path).or_else(|| {
            let is_page = !last_segment(path).contains('.');
            is_page.then(|| self.files.get(SHELL)).flatten()
        })
    }
}

fn allow_inline_scripts(page: &[u8]) -> anyhow::Result<Option<HeaderValue>> {
    let page = std::str::from_utf8(page).context("is not text")?;
    let digests = inline_scripts(page)?
        .iter()
        .map(|script| STANDARD.encode(Sha256::digest(script)))
        .collect::<Vec<_>>();
    if digests.is_empty() {
        return Ok(None);
    }
    policy_allowing_scripts(&digests).map(Some)
}

fn inline_scripts(page: &str) -> anyhow::Result<Vec<String>> {
    let lower = page.to_ascii_lowercase();
    let mut scripts = Vec::new();
    let mut at = 0;
    while let Some(offset) = lower[at..].find('<') {
        let open = at + offset;
        if lower[open..].starts_with(COMMENT_OPEN) {
            let end = lower[open..]
                .find(COMMENT_CLOSE)
                .context("a comment is never closed")?;
            at = open + end + COMMENT_CLOSE.len();
        } else if opens_script(&lower[open..]) {
            let attributes_start = open + SCRIPT_OPEN.len();
            let tag_end = end_of_tag(&lower, attributes_start)?;
            let body_end = start_of_script_close(&lower, tag_end + 1)?;
            if !has_src(&lower[attributes_start..tag_end]) {
                scripts.push(as_the_browser_reads_it(&page[tag_end + 1..body_end]));
            }
            at = body_end + SCRIPT_CLOSE.len();
        } else {
            at = open + 1;
        }
    }
    Ok(scripts)
}

fn opens_script(markup: &str) -> bool {
    markup
        .strip_prefix(SCRIPT_OPEN)
        .and_then(|rest| rest.chars().next())
        .is_some_and(ends_a_tag_name)
}

fn ends_a_tag_name(character: char) -> bool {
    character.is_ascii_whitespace() || matches!(character, '/' | '>')
}

fn end_of_tag(lower: &str, from: usize) -> anyhow::Result<usize> {
    let mut quote = None;
    for (offset, character) in lower[from..].char_indices() {
        match (quote, character) {
            (None, '>') => return Ok(from + offset),
            (None, '"' | '\'') => quote = Some(character),
            (Some(open), _) if open == character => quote = None,
            _ => {}
        }
    }
    anyhow::bail!("a script tag never ends")
}

fn start_of_script_close(lower: &str, from: usize) -> anyhow::Result<usize> {
    let mut at = from;
    while let Some(offset) = lower[at..].find(SCRIPT_CLOSE) {
        let close = at + offset;
        let after = lower[close + SCRIPT_CLOSE.len()..].chars().next();
        if after.is_some_and(ends_a_tag_name) {
            return Ok(close);
        }
        at = close + SCRIPT_CLOSE.len();
    }
    anyhow::bail!("a script is never closed")
}

fn has_src(attributes: &str) -> bool {
    attributes
        .split_whitespace()
        .any(|attribute| attribute == "src" || attribute.starts_with("src="))
}

fn as_the_browser_reads_it(script: &str) -> String {
    script.replace("\r\n", "\n").replace('\r', "\n")
}

fn last_segment(path: &str) -> &str {
    path.rsplit_once('/').map_or(path, |(_, last)| last)
}

const UNESCAPED_PUNCTUATION: &[u8] = b"-._~!$&'()*+,;=:@[]";

fn is_spelled_as_named(name: &str) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || UNESCAPED_PUNCTUATION.contains(&byte))
}

fn content_type_of(path: &str) -> &'static str {
    match last_segment(path)
        .rsplit_once('.')
        .map(|(_, extension)| extension)
    {
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("txt") => "text/plain; charset=utf-8",
        Some("json" | "map") => "application/json",
        Some("webmanifest") => "application/manifest+json",
        Some("svg") => "image/svg+xml",
        Some("xml") => "application/xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn collect(
    directory: &Path,
    prefix: &str,
    files: &mut HashMap<String, Asset>,
) -> anyhow::Result<()> {
    let listing = || format!("read {}", directory.display());
    for entry in fs::read_dir(directory).with_context(listing)? {
        let entry = entry.with_context(listing)?;
        let kind = entry
            .file_type()
            .with_context(|| format!("inspect {}", entry.path().display()))?;
        if !kind.is_dir() && !kind.is_file() {
            continue;
        }
        let name = entry
            .file_name()
            .into_string()
            .ok()
            .filter(|name| is_spelled_as_named(name))
            .with_context(|| {
                format!(
                    "{} has a character other than letters, digits and {}",
                    entry.path().display(),
                    String::from_utf8_lossy(UNESCAPED_PUNCTUATION)
                )
            })?;
        let path = format!("{prefix}{name}");
        if kind.is_dir() {
            collect(&entry.path(), &format!("{path}/"), files)?;
        } else {
            let bytes = fs::read(entry.path())
                .with_context(|| format!("read {}", entry.path().display()))?;
            files.insert(
                path.clone(),
                Asset {
                    bytes: Bytes::from(bytes),
                    content_type: content_type_of(&path),
                    immutable: path.starts_with(IMMUTABLE_DIRECTORY),
                    policy: None,
                },
            );
        }
    }
    Ok(())
}

fn asset_path(request_path: &str) -> Option<&str> {
    let below_root = request_path.strip_prefix(ROOT)?;
    if below_root.is_empty() {
        return Some(below_root);
    }
    below_root.strip_prefix('/')
}

pub(crate) async fn serve(
    State(state): State<AppState>,
    session: Result<Session, Response>,
    uri: Uri,
) -> Response {
    let Some(path) = asset_path(uri.path()) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Some(assets) = &state.assets else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if let Err(sign_in) = session {
        return sign_in;
    }
    assets
        .find(path)
        .map_or_else(|| StatusCode::NOT_FOUND.into_response(), Asset::respond)
}
