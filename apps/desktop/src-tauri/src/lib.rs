use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

const DEFAULT_HOTKEY: &str = "Ctrl+Ctrl";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
  hotkey: String,
  autostart: bool,
}

impl Default for AppSettings {
  fn default() -> Self {
    Self {
      hotkey: DEFAULT_HOTKEY.to_string(),
      autostart: false,
    }
  }
}

struct AppState {
  settings: Mutex<AppSettings>,
}

fn settings_path(app: &tauri::AppHandle) -> Option<PathBuf> {
  let base = app.path().app_config_dir().ok()?;
  Some(base.join("settings.json"))
}

fn load_settings(app: &tauri::AppHandle) -> AppSettings {
  let Some(path) = settings_path(app) else {
    return AppSettings::default();
  };
  let Ok(text) = fs::read_to_string(path) else {
    return AppSettings::default();
  };
  serde_json::from_str(&text).unwrap_or_default()
}

fn save_settings(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
  let Some(path) = settings_path(app) else {
    return Err("无法定位配置目录".into());
  };
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
  fs::write(path, text).map_err(|e| e.to_string())
}

fn parse_shortcut(value: &str) -> Option<Shortcut> {
  let normalized = value.trim().to_ascii_uppercase();
  if normalized == "CTRL+CTRL" {
    return Some(Shortcut::new(Some(Modifiers::CONTROL), Code::ControlLeft));
  }
  if normalized == "ALT+ALT" {
    return Some(Shortcut::new(Some(Modifiers::ALT), Code::AltLeft));
  }
  if normalized == "SHIFT+SHIFT" {
    return Some(Shortcut::new(Some(Modifiers::SHIFT), Code::ShiftLeft));
  }
  None
}

fn show_main_and_emit(app: &tauri::AppHandle, event_name: &str) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit(event_name, ());
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_autostart::init(
      MacosLauncher::LaunchAgent,
      None::<Vec<&str>>,
    ))
    .plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
          if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
            show_main_and_emit(app, "paste-from-clipboard");
          }
        })
        .build(),
    )
    .setup(|app| {
      let tray_menu = tauri::menu::Menu::with_items(
        app,
        &[
          &tauri::menu::MenuItem::with_id(app, "open", "打开", true, None::<&str>)?,
          &tauri::menu::MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?,
          &tauri::menu::MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?,
        ],
      )?;
      tauri::tray::TrayIconBuilder::new()
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event: tauri::menu::MenuEvent| match event.id().as_ref() {
          "open" => show_main_and_emit(app, "paste-from-clipboard"),
          "settings" => show_main_and_emit(app, "open-settings"),
          "quit" => app.exit(0),
          _ => {}
        })
        .build(app)?;

      let settings = load_settings(&app.handle());
      app.manage(AppState {
        settings: Mutex::new(settings.clone()),
      });

      if settings.autostart {
        let _ = app.autolaunch().enable();
      } else {
        let _ = app.autolaunch().disable();
      }

      if let Some(shortcut) = parse_shortcut(&settings.hotkey) {
        let _ = app.global_shortcut().register(shortcut);
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      set_click_through,
      set_always_on_top,
      exit_app,
      get_settings,
      update_settings
    ])
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
fn set_click_through(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
  window
    .set_ignore_cursor_events(enabled)
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_always_on_top(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
  window.set_always_on_top(enabled).map_err(|e| e.to_string())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
  app.exit(0);
}

#[tauri::command]
fn get_settings(app: tauri::AppHandle, state: tauri::State<AppState>) -> Result<AppSettings, String> {
  let settings = state.settings.lock().map_err(|e| e.to_string())?.clone();
  if settings.hotkey.is_empty() {
    let fallback = load_settings(&app);
    return Ok(fallback);
  }
  Ok(settings)
}

#[tauri::command]
fn update_settings(
  app: tauri::AppHandle,
  state: tauri::State<AppState>,
  hotkey: String,
  autostart: bool,
) -> Result<AppSettings, String> {
  if hotkey.trim().is_empty() {
    return Err("热键不能为空".into());
  }
  let Some(shortcut) = parse_shortcut(&hotkey) else {
    return Err("当前仅支持 Ctrl+Ctrl / Alt+Alt / Shift+Shift".into());
  };

  let mut guard = state.settings.lock().map_err(|e| e.to_string())?;
  if let Some(old) = parse_shortcut(&guard.hotkey) {
    let _ = app.global_shortcut().unregister(old);
  }
  app
    .global_shortcut()
    .register(shortcut)
    .map_err(|e| e.to_string())?;

  if autostart {
    app
      .autolaunch()
      .enable()
      .map_err(|e| format!("{e:?}"))?;
  } else {
    app
      .autolaunch()
      .disable()
      .map_err(|e| format!("{e:?}"))?;
  }

  guard.hotkey = hotkey;
  guard.autostart = autostart;
  save_settings(&app, &guard)?;
  Ok(guard.clone())
}
