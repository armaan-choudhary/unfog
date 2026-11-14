use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::Path;

pub fn init_db(db_path: &Path) -> anyhow::Result<Connection> {
    let conn = Connection::open(db_path)?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS node_verification (
            node_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS confidence_tags (
            node_id TEXT PRIMARY KEY,
            tag TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        "#,
    )?;

    Ok(conn)
}

pub fn save_node_verification(
    conn: &Connection,
    node_id: &str,
    status: &str,
) -> anyhow::Result<()> {
    conn.execute(
        r#"
        INSERT INTO node_verification (node_id, status, updated_at)
        VALUES (?1, ?2, CURRENT_TIMESTAMP)
        ON CONFLICT(node_id) DO UPDATE SET
            status = excluded.status,
            updated_at = CURRENT_TIMESTAMP;
        "#,
        params![node_id, status],
    )?;
    Ok(())
}

pub fn save_confidence_tag(
    conn: &Connection,
    node_id: &str,
    tag: &str,
) -> anyhow::Result<()> {
    conn.execute(
        r#"
        INSERT INTO confidence_tags (node_id, tag, updated_at)
        VALUES (?1, ?2, CURRENT_TIMESTAMP)
        ON CONFLICT(node_id) DO UPDATE SET
            tag = excluded.tag,
            updated_at = CURRENT_TIMESTAMP;
        "#,
        params![node_id, tag],
    )?;
    Ok(())
}

pub fn load_state(
    conn: &Connection,
) -> anyhow::Result<(HashMap<String, String>, HashMap<String, String>)> {
    let mut stmt = conn.prepare("SELECT node_id, status FROM node_verification")?;
    let verification_rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut understood = HashMap::new();
    for row in verification_rows {
        let (id, status) = row?;
        understood.insert(id, status);
    }

    let mut stmt_tags = conn.prepare("SELECT node_id, tag FROM confidence_tags")?;
    let tag_rows = stmt_tags.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut tags = HashMap::new();
    for row in tag_rows {
        let (id, tag) = row?;
        tags.insert(id, tag);
    }

    Ok((understood, tags))
}
