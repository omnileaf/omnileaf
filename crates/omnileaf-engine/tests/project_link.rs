use omnileaf_engine::ProjectLink;

const REPOSITORY: &str = "https://github.com/omnileaf/omnileaf";

#[test]
fn opens_the_source_code_at_the_repository() {
    let url = ProjectLink::SourceCode.url();

    assert_eq!(url, REPOSITORY);
}

#[test]
fn opens_a_new_bug_report_in_the_repository() {
    let url = ProjectLink::NewIssue.url();

    assert_eq!(
        url,
        format!("{REPOSITORY}/issues/new?template=bug_report.yml")
    );
}

#[test]
fn opens_only_https_pages() {
    let links = [ProjectLink::SourceCode, ProjectLink::NewIssue];

    let insecure: Vec<&str> = links
        .into_iter()
        .map(ProjectLink::url)
        .filter(|url| !url.starts_with("https://"))
        .collect();

    assert!(insecure.is_empty(), "{insecure:?}");
}
