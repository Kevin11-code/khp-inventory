use std::fs;
use std::sync::Mutex;

use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use password_hash::SaltString;
use rand_core::OsRng;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use tauri::{Manager, State};

const DEFAULT_UNLOCK_CODE: &str = "2026+11=";
const SEED_APP_STATE: &str = include_str!("../seed/app_state.json");

struct AppDb {
    conn: Mutex<Connection>,
}

#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("auth error: {0}")]
    Auth(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

type AppResult<T> = Result<T, AppError>;

#[tauri::command]
fn load_app_state(db: State<'_, AppDb>) -> AppResult<Value> {
    let conn = db.conn.lock().map_err(|_| AppError::Auth("database lock poisoned".into()))?;
    let state: String = conn.query_row(
        "SELECT value FROM app_state WHERE key = 'inventory_state'",
        [],
        |row| row.get(0),
    )?;
    Ok(serde_json::from_str(&state)?)
}

#[tauri::command]
fn save_app_state(db: State<'_, AppDb>, state: Value) -> AppResult<()> {
    let serialized = serde_json::to_string(&state)?;
    let conn = db.conn.lock().map_err(|_| AppError::Auth("database lock poisoned".into()))?;
    conn.execute(
        "INSERT INTO app_state (key, value, updated_at)
         VALUES ('inventory_state', ?1, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![serialized],
    )?;
    Ok(())
}

#[tauri::command]
fn verify_unlock_code(db: State<'_, AppDb>, code: String) -> AppResult<bool> {
    let normalized = normalize_unlock_code(&code);
    let conn = db.conn.lock().map_err(|_| AppError::Auth("database lock poisoned".into()))?;
    let hash: String = conn.query_row(
        "SELECT password_hash FROM auth_credentials WHERE id = 1",
        [],
        |row| row.get(0),
    )?;
    let parsed_hash = PasswordHash::new(&hash).map_err(|err| AppError::Auth(err.to_string()))?;
    let verified = Argon2::default()
        .verify_password(normalized.as_bytes(), &parsed_hash)
        .is_ok();

    conn.execute(
        "INSERT INTO auth_events (success, attempted_at) VALUES (?1, datetime('now'))",
        params![if verified { 1 } else { 0 }],
    )?;

    Ok(verified)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let db = init_database(app)?;
            app.manage(AppDb {
                conn: Mutex::new(db),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_app_state,
            save_app_state,
            verify_unlock_code
        ])
        .run(tauri::generate_context!())
        .expect("error while running KHP Inventory");
}

fn init_database(app: &tauri::App) -> AppResult<Connection> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| AppError::Auth(err.to_string()))?;
    fs::create_dir_all(&app_dir)?;
    let db_path = app_dir.join("khp-inventory.sqlite3");
    let conn = Connection::open(db_path)?;
    run_migrations(&conn)?;
    seed_database(&conn)?;
    Ok(conn)
}

fn run_migrations(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(include_str!("../migrations/001_initial.sql"))?;
    Ok(())
}

fn seed_database(conn: &Connection) -> AppResult<()> {
    let existing_state: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM app_state WHERE key = 'inventory_state'",
            [],
            |row| row.get(0),
        )
        .optional()?;

    if existing_state.is_none() {
        let seed: Value = serde_json::from_str(SEED_APP_STATE)?;
        conn.execute(
            "INSERT INTO app_state (key, value, updated_at) VALUES ('inventory_state', ?1, datetime('now'))",
            params![serde_json::to_string(&seed)?],
        )?;
    }

    let existing_auth: Option<i64> = conn
        .query_row("SELECT 1 FROM auth_credentials WHERE id = 1", [], |row| row.get(0))
        .optional()?;

    if existing_auth.is_none() {
        let hash = hash_unlock_code(DEFAULT_UNLOCK_CODE)?;
        conn.execute(
            "INSERT INTO auth_credentials (id, password_hash, created_at) VALUES (1, ?1, datetime('now'))",
            params![hash],
        )?;
    }

    Ok(())
}

fn hash_unlock_code(code: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(normalize_unlock_code(code).as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|err| AppError::Auth(err.to_string()))
}

fn normalize_unlock_code(code: &str) -> String {
    code.chars().filter(|ch| !ch.is_whitespace()).collect()
}
