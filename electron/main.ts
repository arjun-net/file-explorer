import { app, BrowserWindow, protocol, net, Menu, nativeImage } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpcHandlers, cleanupWatchers } from "./ipc";
import { SearchIndex, type IndexStatus, type EmbedStatus } from "./indexer";
import { getDefaultDbPath } from "./indexer/db";
import { SettingsStore } from "./settings";

const isDev = !!process.env.VITE_DEV_SERVER_URL;

// The packaged app gets its icon from electron-builder (build-assets/icon.icns).
// In dev, Electron would otherwise show its own default icon in the Dock.
if (isDev && process.platform === "darwin") {
  const icon = nativeImage.createFromPath(path.join(__dirname, "../build-assets/AppIcon.iconset/icon_512x512.png"));
  if (!icon.isEmpty()) app.dock?.setIcon(icon);
}

protocol.registerSchemesAsPrivileged([
  { scheme: "localfile", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 720,
    minHeight: 420,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#1e1f22",
    // Native frosted-glass sidebar (macOS only; ignored elsewhere). Only
    // shows through where the page's own CSS leaves the sidebar/titlebar
    // background transparent — the main content pane stays opaque for
    // legibility.
    vibrancy: "sidebar",
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.on("closed", () => cleanupWatchers(win.id));

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    win.webContents.openDevTools({ mode: "detach" });
    win.webContents.on("console-message", (event) => {
      console.log(`[renderer] ${event.message} (${event.sourceId}:${event.lineNumber})`);
    });
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  protocol.handle("localfile", (request) => {
    const filePath = decodeURIComponent(request.url.replace("localfile://", ""));
    return net.fetch(pathToFileURL(filePath).href);
  });

  if (process.platform === "darwin") {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
        {
          label: "Edit",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" },
          ],
        },
        {
          label: "View",
          submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "togglefullscreen" }],
        },
        {
          label: "Window",
          submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
        },
      ])
    );
  }

  const win = createWindow();

  const searchIndex = new SearchIndex(
    getDefaultDbPath(app.getPath("userData")),
    path.join(app.getPath("userData"), "models"),
    (status: IndexStatus) => {
      if (!win.isDestroyed()) win.webContents.send("index:statusChanged", status);
    },
    (status: EmbedStatus) => {
      if (!win.isDestroyed()) win.webContents.send("index:embedStatusChanged", status);
    }
  );

  const settings = new SettingsStore(app.getPath("userData"));
  registerIpcHandlers(searchIndex, settings);

  app.on("before-quit", () => searchIndex.close());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
