#![expect(
    clippy::unwrap_used,
    reason = "each test runs the dashboard on its own port, so a failed set-up should stop the test"
)]

use std::{
    net::TcpListener,
    process::{Child, Command, Output, Stdio},
    time::{Duration, Instant},
};

const BINARY: &str = env!("CARGO_BIN_EXE_omnileaf-admin");

fn free_address() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap().to_string()
}

fn health(address: &str) -> Output {
    Command::new(BINARY)
        .env("ADMIN_LISTEN", address)
        .arg("health")
        .output()
        .unwrap()
}

struct Serving(Child);

impl Drop for Serving {
    fn drop(&mut self) {
        self.0.kill().unwrap();
        self.0.wait().unwrap();
    }
}

fn serve(address: &str) -> Serving {
    Serving(
        Command::new(BINARY)
            .env("ADMIN_LISTEN", address)
            .env("GITHUB_CLIENT_ID", "client-id")
            .env("GITHUB_CLIENT_SECRET", "client-secret")
            .env("GITHUB_ORG", "acme")
            .env("GITHUB_TEAM", "reviewers")
            .env("ADMIN_SESSION_KEY", "fake-session-key".repeat(2))
            .env("ADMIN_RELAY_URL", "http://127.0.0.1:1")
            .env("ADMIN_RELAY_TOKEN", "relay-token")
            .arg("serve")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap(),
    )
}

#[test]
fn passes_its_health_check_against_a_running_dashboard() {
    let address = free_address();
    let _serving = serve(&address);
    let deadline = Instant::now() + Duration::from_secs(20);

    let mut output = health(&address);
    while !output.status.success() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(100));
        output = health(&address);
    }

    assert!(output.status.success());
}

#[test]
fn fails_its_health_check_when_nothing_listens() {
    let output = health(&free_address());

    assert!(!output.status.success());
}
