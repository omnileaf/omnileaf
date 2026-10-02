#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use omnileaf_db::Database;
use support::ScratchFolder;

#[tokio::test]
async fn gives_each_new_library_a_node_id_of_its_own() {
    let folders = [ScratchFolder::new("node-a"), ScratchFolder::new("node-b")];

    let mut node_ids = Vec::new();
    for folder in &folders {
        node_ids.extend(local_node_ids(&Database::open(&folder.config()).unwrap()).await);
    }

    assert_eq!(node_ids.len(), 2);
    assert_ne!(node_ids.first(), node_ids.last());
}

async fn local_node_ids(database: &Database) -> Vec<[u8; 16]> {
    database
        .read(|connection| {
            let mut statement = connection.prepare("SELECT node_id FROM sync_local")?;
            let ids = statement.query_map([], |row| row.get(0))?;
            Ok(ids.collect::<Result<_, _>>()?)
        })
        .await
        .unwrap()
}
