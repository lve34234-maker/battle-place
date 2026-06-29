// Electron 진입점 — 웹 게임을 데스크톱 창으로 띄움
const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "배틀플레이스: 생존",
    backgroundColor: "#0b0e0c",
    webPreferences: { contextIsolation: true },
  });
  // 게임 루트(이 파일 기준 ../../)의 survival.html 을 로드
  win.loadFile(path.join(__dirname, "..", "..", "survival.html"));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
