use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, Manager, State};

struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
struct Ptys(Mutex<HashMap<u32, Session>>);

#[tauri::command]
fn spawn_pty(
    app: AppHandle,
    state: State<'_, Ptys>,
    id: u32,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    on_data: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    let pty = native_pty_system()
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut cmd = CommandBuilder::new(&shell);
    // login shell so PATH picks up user-installed CLIs (claude, codex, gemini)
    cmd.arg("-l");
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    if let Some(dir) = cwd.or_else(|| std::env::var("HOME").ok()) {
        cmd.cwd(dir);
    }

    let mut child = pty.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let killer = child.clone_killer();
    let mut reader = pty.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pty.master.take_writer().map_err(|e| e.to_string())?;

    state.0.lock().unwrap().insert(
        id,
        Session {
            writer,
            master: pty.master,
            killer,
        },
    );

    // Stream raw PTY bytes to the frontend; xterm.js handles UTF-8 chunking.
    std::thread::spawn(move || {
        let mut buf = [0u8; 16384];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if on_data
                        .send(InvokeResponseBody::Raw(buf[..n].to_vec()))
                        .is_err()
                    {
                        break;
                    }
                }
            }
        }
        app.state::<Ptys>().0.lock().unwrap().remove(&id);
        let _ = app.emit("pty-exit", id);
    });

    // Reap the child so it doesn't zombie.
    std::thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(())
}

#[tauri::command]
fn write_pty(state: State<'_, Ptys>, id: u32, data: String) {
    if let Some(s) = state.0.lock().unwrap().get_mut(&id) {
        let _ = s.writer.write_all(data.as_bytes());
    }
}

#[tauri::command]
fn resize_pty(state: State<'_, Ptys>, id: u32, cols: u16, rows: u16) {
    if let Some(s) = state.0.lock().unwrap().get(&id) {
        let _ = s.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        });
    }
}

#[tauri::command]
fn kill_pty(state: State<'_, Ptys>, id: u32) {
    if let Some(mut s) = state.0.lock().unwrap().remove(&id) {
        let _ = s.killer.kill();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Ptys::default())
        .setup(|app| {
            // Custom menu without File > Close Window so ⌘W reaches the
            // webview (close tab); Edit roles keep ⌘C/⌘V working on macOS.
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{MenuBuilder, SubmenuBuilder};
                let app_menu = SubmenuBuilder::new(app, "Ghost")
                    .about(None)
                    .separator()
                    .services()
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?;
                let edit = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;
                let menu = MenuBuilder::new(app).items(&[&app_menu, &edit]).build()?;
                app.set_menu(menu)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            spawn_pty, write_pty, resize_pty, kill_pty
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
