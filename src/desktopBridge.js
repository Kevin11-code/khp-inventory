import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

const STORAGE_KEY = "khp_inventory_state";
const SESSION_KEY = "khp_inventory_unlocked";
const CALCULATOR_SIZE = new LogicalSize(360, 520);

const hasTauri = () => Boolean(window.__TAURI_INTERNALS__);

export async function loadAppState() {
  if (hasTauri()) {
    return invoke("load_app_state");
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : null;
}

export async function saveAppState(state) {
  if (hasTauri()) {
    await invoke("save_app_state", { state });
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function verifyUnlockCode(code) {
  if (hasTauri()) {
    return invoke("verify_unlock_code", { code });
  }

  return normalizeUnlockCode(code) === "2026+11=";
}

export function isSessionUnlocked() {
  return window.sessionStorage.getItem(SESSION_KEY) === "1";
}

export function setSessionUnlocked(value) {
  if (value) {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } else {
    window.sessionStorage.removeItem(SESSION_KEY);
  }
}

export async function setCalculatorWindowMode() {
  if (!hasTauri()) return;

  const appWindow = getCurrentWindow();
  await appWindow.setFullscreen(false);
  await appWindow.unmaximize();
  await appWindow.setTitle("Calculator");
  await appWindow.setResizable(true);
  await appWindow.setMinSize(null);
  await appWindow.setMaxSize(null);
  await appWindow.setSize(CALCULATOR_SIZE);
  await appWindow.setMinSize(CALCULATOR_SIZE);
  await appWindow.setMaxSize(CALCULATOR_SIZE);
  await appWindow.setResizable(false);
  await appWindow.center();
  await appWindow.setFocus();
}

export async function setInventoryWindowMode() {
  if (!hasTauri()) return;

  const appWindow = getCurrentWindow();
  await appWindow.setFullscreen(false);
  await appWindow.setMaxSize(null);
  await appWindow.setMinSize(new LogicalSize(960, 640));
  await appWindow.setResizable(true);
  await appWindow.setTitle("KHP Steelworks Inventory");
  await appWindow.maximize();
  await appWindow.setFocus();
}

function normalizeUnlockCode(code) {
  return String(code).replace(/\s+/g, "");
}
