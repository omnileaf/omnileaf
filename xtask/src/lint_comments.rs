//! The comment rules no single linter checks across Rust and TypeScript: no plain or block comments, no warning words, phase labels or references elsewhere, and short doc comments.

use std::fmt;

use crate::policy::RepositoryFile;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Violation {
    PlainComment {
        path: String,
        line: usize,
    },
    BlockComment {
        path: String,
        line: usize,
    },
    HtmlComment {
        path: String,
        line: usize,
    },
    WarningWord {
        path: String,
        line: usize,
        word: String,
    },
    PhaseLabel {
        path: String,
        line: usize,
    },
    Reference {
        path: String,
        line: usize,
        reference: String,
    },
    LongDoc {
        path: String,
        line: usize,
        prose_lines: usize,
    },
}

impl fmt::Display for Violation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::PlainComment { path, line } => write!(
                f,
                "{path}:{line}: a plain comment; let the code say it, or state a contract in a doc comment"
            ),
            Self::BlockComment { path, line } => {
                write!(f, "{path}:{line}: a block comment that isn't a doc comment")
            }
            Self::HtmlComment { path, line } => write!(
                f,
                "{path}:{line}: an HTML comment that isn't a licence notice"
            ),
            Self::WarningWord { path, line, word } => write!(
                f,
                "{path}:{line}: \"{word}\" in a comment; finish the work or raise it"
            ),
            Self::PhaseLabel { path, line } => write!(
                f,
                "{path}:{line}: a test phase label; separate the phases with blank lines"
            ),
            Self::Reference {
                path,
                line,
                reference,
            } => write!(
                f,
                "{path}:{line}: \"{reference}\" points elsewhere; state the rule instead"
            ),
            Self::LongDoc {
                path,
                line,
                prose_lines,
            } => write!(
                f,
                "{path}:{line}: a doc comment of {prose_lines} lines; keep it to {MOST_DOC_PROSE_LINES} and move the rest to the docs folder"
            ),
        }
    }
}

const MOST_DOC_PROSE_LINES: usize = 3;
const CHECKED_EXTENSIONS: &[&str] = &[".rs", ".ts", ".js", SVELTE_EXTENSION];
const SVELTE_EXTENSION: &str = ".svelte";
const GENERATED: &[&str] = &[
    "app/src/lib/ipc/bindings.ts",
    "app/src/lib/licences/",
    "app/src-tauri/gen/",
];
const RUST_DOC_MARKERS: &[&str] = &["///", "//!"];
const DIRECTIVES: &[&str] = &[
    "SAFETY:",
    "eslint-disable",
    "eslint-enable",
    "@ts-expect-error",
    "prettier-ignore",
    "svelte-ignore",
    "@vitest-environment",
    "c8 ignore",
];
const WARNING_WORDS: &[&str] = &["todo", "fixme", "xxx", "hack"];
const PHASE_LABELS: &[&str] = &["arrange", "act", "assert", "given", "when", "then"];
const STANDARD_NAMES: &[&str] = &["CRC", "FNV", "ISO", "SHA", "UTF"];
const DECISION_RECORD: &str = "ADR";
const DOCUMENT_POINTERS: &[&str] = &["docs/", "AGENTS.md"];
const DOC_HEADINGS: &[&str] = &["# Errors", "# Panics", "# Safety"];
const LICENCE_MARK: &str = "License";

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Plain,
    RustDoc(&'static str),
    DocBlock,
    Block,
    Html,
}

impl Kind {
    fn closer(self) -> Option<&'static str> {
        match self {
            Self::DocBlock | Self::Block => Some("*/"),
            Self::Html => Some("-->"),
            Self::Plain | Self::RustDoc(_) => None,
        }
    }
}

struct Comment {
    kind: Kind,
    start: usize,
    lines: Vec<(usize, String)>,
}

impl Comment {
    /// Returns whether the comment ends on this line.
    fn push(&mut self, number: usize, text: &str) -> bool {
        let (inside, closed) = match self.kind.closer() {
            Some(closer) => text
                .split_once(closer)
                .map_or((text, false), |(before, _)| (before, true)),
            None => (text, true),
        };
        let trimmed = inside.trim();
        let prose = trimmed.strip_prefix('*').unwrap_or(trimmed).trim();
        self.lines.push((number, prose.to_owned()));
        closed
    }

    fn continues_at(&self, kind: Kind, number: usize) -> bool {
        self.kind == kind
            && self
                .lines
                .last()
                .is_some_and(|(last, _)| last + 1 == number)
    }

    fn prose_lines(&self) -> usize {
        self.lines.iter().filter(|(_, line)| is_prose(line)).count()
    }

    fn text(&self) -> String {
        self.lines
            .iter()
            .map(|(_, text)| text.as_str())
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    }
}

pub(crate) fn check(files: &[RepositoryFile<'_>]) -> Vec<Violation> {
    files
        .iter()
        .filter(|file| is_checked(file.path))
        .flat_map(violations_in)
        .collect()
}

fn is_checked(path: &str) -> bool {
    CHECKED_EXTENSIONS
        .iter()
        .any(|extension| path.ends_with(extension))
        && !GENERATED
            .iter()
            .any(|generated| path.starts_with(generated))
}

fn violations_in(file: &RepositoryFile<'_>) -> Vec<Violation> {
    let source = String::from_utf8_lossy(file.bytes);
    comments_in(file.path, &source)
        .iter()
        .flat_map(|comment| violations_of(file.path, comment))
        .collect()
}

/// Reads only comments that start a line, so a `//` or `/*` inside a string on a line of code never counts.
fn comments_in(path: &str, source: &str) -> Vec<Comment> {
    let reads_html = path.ends_with(SVELTE_EXTENSION);
    let mut comments: Vec<Comment> = Vec::new();
    let mut open: Option<Comment> = None;
    for (number, line) in (1..).zip(source.lines()) {
        let trimmed = line.trim_start();
        if let Some(mut comment) = open.take() {
            if comment.push(number, trimmed) {
                comments.push(comment);
            } else {
                open = Some(comment);
            }
            continue;
        }
        let Some((kind, rest)) = opening(trimmed, reads_html) else {
            continue;
        };
        if let Some(run) = comments
            .last_mut()
            .filter(|last| matches!(kind, Kind::RustDoc(_)) && last.continues_at(kind, number))
        {
            run.push(number, rest);
            continue;
        }
        let mut comment = Comment {
            kind,
            start: number,
            lines: Vec::new(),
        };
        if comment.push(number, rest) {
            comments.push(comment);
        } else {
            open = Some(comment);
        }
    }
    comments.extend(open);
    comments
}

fn opening(trimmed: &str, reads_html: bool) -> Option<(Kind, &str)> {
    RUST_DOC_MARKERS
        .iter()
        .find_map(|marker| {
            trimmed
                .strip_prefix(marker)
                .map(|rest| (Kind::RustDoc(marker), rest))
        })
        .or_else(|| trimmed.strip_prefix("//").map(|rest| (Kind::Plain, rest)))
        .or_else(|| {
            trimmed
                .strip_prefix("/**")
                .map(|rest| (Kind::DocBlock, rest))
        })
        .or_else(|| trimmed.strip_prefix("/*").map(|rest| (Kind::Block, rest)))
        .or_else(|| {
            reads_html
                .then(|| trimmed.strip_prefix("<!--"))
                .flatten()
                .map(|rest| (Kind::Html, rest))
        })
}

fn violations_of(path: &str, comment: &Comment) -> Vec<Violation> {
    let text = comment.text();
    if comment.kind == Kind::Html && text.contains(LICENCE_MARK) {
        return Vec::new();
    }
    let mut violations: Vec<Violation> =
        shape_violation(path, comment, &text).into_iter().collect();
    if is_phase_label(&text) {
        violations.push(Violation::PhaseLabel {
            path: path.to_owned(),
            line: comment.start,
        });
    }
    for (line, words) in &comment.lines {
        violations.extend(warning_words(words).map(|word| Violation::WarningWord {
            path: path.to_owned(),
            line: *line,
            word: word.to_owned(),
        }));
        violations.extend(
            references_in(words)
                .into_iter()
                .map(|reference| Violation::Reference {
                    path: path.to_owned(),
                    line: *line,
                    reference,
                }),
        );
    }
    violations
}

fn shape_violation(path: &str, comment: &Comment, text: &str) -> Option<Violation> {
    let path = path.to_owned();
    let line = comment.start;
    match comment.kind {
        Kind::Plain => (!is_directive(text)).then_some(Violation::PlainComment { path, line }),
        Kind::Block => Some(Violation::BlockComment { path, line }),
        Kind::Html => Some(Violation::HtmlComment { path, line }),
        Kind::RustDoc(_) | Kind::DocBlock => {
            let prose_lines = comment.prose_lines();
            (prose_lines > MOST_DOC_PROSE_LINES).then_some(Violation::LongDoc {
                path,
                line,
                prose_lines,
            })
        }
    }
}

fn is_directive(text: &str) -> bool {
    DIRECTIVES
        .iter()
        .any(|directive| text.starts_with(directive))
}

fn is_prose(line: &str) -> bool {
    !line.is_empty() && !line.starts_with('@') && !DOC_HEADINGS.contains(&line)
}

fn is_phase_label(text: &str) -> bool {
    let label = text.trim().trim_end_matches(':').to_lowercase();
    PHASE_LABELS.contains(&label.as_str())
}

fn warning_words(text: &str) -> impl Iterator<Item = &str> {
    text.split(|character: char| !character.is_alphanumeric())
        .filter(|word| WARNING_WORDS.contains(&word.to_lowercase().as_str()))
}

fn references_in(text: &str) -> Vec<String> {
    let mut references = issue_numbers(text);
    references.extend(
        text.split(|character: char| !(character.is_ascii_alphanumeric() || character == '-'))
            .filter(|token| is_ticket(token) || *token == DECISION_RECORD)
            .map(str::to_owned),
    );
    references.extend(
        DOCUMENT_POINTERS
            .iter()
            .filter(|pointer| text.contains(**pointer))
            .map(|pointer| (*pointer).to_owned()),
    );
    references
}

fn issue_numbers(text: &str) -> Vec<String> {
    text.match_indices('#')
        .filter(|(at, _)| {
            text.get(..*at)
                .and_then(|before| before.chars().last())
                .is_none_or(|previous| !previous.is_alphanumeric())
        })
        .filter_map(|(at, _)| {
            let digits: String = text
                .get(at + 1..)?
                .chars()
                .take_while(char::is_ascii_digit)
                .collect();
            (!digits.is_empty()).then(|| format!("#{digits}"))
        })
        .collect()
}

fn is_ticket(token: &str) -> bool {
    token.split_once('-').is_some_and(|(prefix, number)| {
        prefix.len() >= 2
            && prefix
                .chars()
                .all(|character| character.is_ascii_uppercase())
            && number.starts_with(|character: char| character.is_ascii_digit())
            && !STANDARD_NAMES.contains(&prefix)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(path: &'static str, content: &'static str) -> RepositoryFile<'static> {
        RepositoryFile {
            path,
            bytes: content.as_bytes(),
        }
    }

    fn checked(path: &'static str, content: &'static str) -> Vec<Violation> {
        check(&[text(path, content)])
    }

    #[test]
    fn flags_a_plain_line_comment() {
        let violations = checked("crates/a/src/lib.rs", "fn f() {}\n    // explain f\n");

        assert_eq!(
            violations,
            [Violation::PlainComment {
                path: "crates/a/src/lib.rs".to_owned(),
                line: 2
            }]
        );
    }

    #[test]
    fn allows_the_directives_tools_read() {
        let content = "// SAFETY: the pointer is valid\n\
                       // eslint-disable-next-line no-undef -- the global is injected\n\
                       // @ts-expect-error the type is wrong upstream\n\
                       // prettier-ignore\n\
                       // svelte-ignore a11y_click_events_have_key_events\n\
                       // @vitest-environment jsdom\n\
                       // c8 ignore next\n";

        let violations = checked("app/src/lib/a.ts", content);

        assert!(violations.is_empty(), "{violations:?}");
    }

    #[test]
    fn allows_doc_comments_in_every_language() {
        let files = [
            text(
                "crates/a/src/lib.rs",
                "//! A crate.\n\n/// A function.\nfn f() {}\n",
            ),
            text(
                "app/src/lib/a.ts",
                "/** A function. */\nexport function f() {}\n",
            ),
        ];

        let violations = check(&files);

        assert!(violations.is_empty(), "{violations:?}");
    }

    #[test]
    fn flags_a_block_comment_that_is_not_a_doc_comment() {
        let violations = checked(
            "app/src/lib/a.ts",
            "/* explain f */\nexport function f() {}\n",
        );

        assert_eq!(
            violations,
            [Violation::BlockComment {
                path: "app/src/lib/a.ts".to_owned(),
                line: 1
            }]
        );
    }

    #[test]
    fn ignores_comment_markers_inside_strings_on_a_line_of_code() {
        let content = "const LINK = xpath(\"//nav//a[normalize-space()='Library']\");\n\
                       const SPECS = \"tests/app/**/*.e2e.ts\";\n\
                       const URL = \"file:///tmp/a\";\n\
                       const SITE = \"https://example.org\";\n";

        let violations = checked("app/tests/app/a.ts", content);

        assert!(violations.is_empty(), "{violations:?}");
    }

    #[test]
    fn flags_warning_words_in_any_case() {
        let violations = checked(
            "crates/a/src/lib.rs",
            "/// Todo: handle the empty case.\nfn f() {}\n",
        );

        assert_eq!(
            violations,
            [Violation::WarningWord {
                path: "crates/a/src/lib.rs".to_owned(),
                line: 1,
                word: "Todo".to_owned()
            }]
        );
    }

    #[test]
    fn flags_a_comment_that_only_labels_a_test_phase() {
        let violations = checked("app/src/lib/a.test.ts", "/** Act */\nconst result = f();\n");

        assert_eq!(
            violations,
            [Violation::PhaseLabel {
                path: "app/src/lib/a.test.ts".to_owned(),
                line: 1
            }]
        );
    }

    #[test]
    fn flags_an_issue_or_ticket_reference() {
        let violations = checked(
            "crates/a/src/lib.rs",
            "/// Works around #482.\nfn f() {}\n/// Added for PROJ-123.\nfn g() {}\n",
        );

        assert_eq!(
            violations,
            [
                Violation::Reference {
                    path: "crates/a/src/lib.rs".to_owned(),
                    line: 1,
                    reference: "#482".to_owned()
                },
                Violation::Reference {
                    path: "crates/a/src/lib.rs".to_owned(),
                    line: 3,
                    reference: "PROJ-123".to_owned()
                }
            ]
        );
    }

    #[test]
    fn allows_names_of_standards_that_look_like_tickets() {
        let violations = checked(
            "crates/a/src/lib.rs",
            "/// Each image's CRC-32, hashed with FNV-1a, in UTF-8 and SHA-256.\nfn f() {}\n",
        );

        assert!(violations.is_empty(), "{violations:?}");
    }

    #[test]
    fn flags_a_pointer_to_other_documents() {
        let violations = checked(
            "crates/a/src/lib.rs",
            "/// See docs/sync.md.\nfn f() {}\n/// Decided in ADR 2.\nfn g() {}\n/// Rules in AGENTS.md.\nfn h() {}\n",
        );

        let references: Vec<&str> = violations
            .iter()
            .filter_map(|violation| match violation {
                Violation::Reference { reference, .. } => Some(reference.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(references, ["docs/", "ADR", "AGENTS.md"]);
    }

    #[test]
    fn flags_a_rust_doc_of_more_than_three_prose_lines() {
        let content = "/// One.\n/// Two.\n/// Three.\n/// Four.\nfn f() {}\n";

        let violations = checked("crates/a/src/lib.rs", content);

        assert_eq!(
            violations,
            [Violation::LongDoc {
                path: "crates/a/src/lib.rs".to_owned(),
                line: 1,
                prose_lines: 4
            }]
        );
    }

    #[test]
    fn flags_a_tsdoc_block_of_more_than_three_prose_lines() {
        let content = "/**\n * One.\n * Two.\n * Three.\n * Four.\n */\nexport function f() {}\n";

        let violations = checked("app/src/lib/a.ts", content);

        assert_eq!(
            violations,
            [Violation::LongDoc {
                path: "app/src/lib/a.ts".to_owned(),
                line: 1,
                prose_lines: 4
            }]
        );
    }

    #[test]
    fn does_not_count_blank_tag_or_heading_lines_as_prose() {
        let files = [
            text(
                "crates/a/src/lib.rs",
                "/// Opens the file.\n///\n/// # Errors\n///\n/// When it is missing.\nfn f() {}\n",
            ),
            text(
                "app/src/lib/a.ts",
                "/**\n * Opens the file.\n *\n * @param path where it is\n * @returns its bytes\n * @throws when it is missing\n */\nexport function f() {}\n",
            ),
        ];

        let violations = check(&files);

        assert!(violations.is_empty(), "{violations:?}");
    }

    #[test]
    fn flags_an_html_comment_in_svelte() {
        let violations = checked("app/src/lib/A.svelte", "<!-- the header -->\n<h1>Hi</h1>\n");

        assert_eq!(
            violations,
            [Violation::HtmlComment {
                path: "app/src/lib/A.svelte".to_owned(),
                line: 1
            }]
        );
    }

    #[test]
    fn allows_a_licence_notice_in_an_html_comment() {
        let content = "<!--\n  Adapted from Lucide.\n\n  ISC License\n\n  Copyright (c) Lucide Contributors\n-->\n<svg></svg>\n";

        let violations = checked("app/src/lib/Icon.svelte", content);

        assert!(violations.is_empty(), "{violations:?}");
    }

    #[test]
    fn skips_generated_files() {
        let files = [
            text("app/src/lib/ipc/bindings.ts", "// generated by specta\n"),
            text("app/src-tauri/gen/android/app/build.js", "// template\n"),
        ];

        let violations = check(&files);

        assert!(violations.is_empty(), "{violations:?}");
    }

    #[test]
    fn skips_files_in_other_languages() {
        let files = [
            text("README.md", "<!-- a note -->\n"),
            text(".github/workflows/ci.yml", "# a note\n"),
            text("crates/a/migrations/0001.sql", "-- a note\n"),
        ];

        let violations = check(&files);

        assert!(violations.is_empty(), "{violations:?}");
    }
}
