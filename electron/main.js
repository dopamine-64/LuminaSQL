const { app, BrowserWindow, session, Menu } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

app.setName("LuminaSQL");

// Removes the native in-window menu bar (File/Edit/View/...).
// On macOS the app menu lives in the global top bar so it never
// took up window space, but on Windows/Linux it renders inside the
// BrowserWindow by default and eats into the fixed content height —
// which is what was pushing/cropping the header on Windows.
Menu.setApplicationMenu(null);

let backendProcess;

function startBackend() {

    const backendExecutable =
        process.platform === "win32"
            ? "main.exe"
            : "main";

    let backendPath;

    if (app.isPackaged) {
        backendPath = path.join(
            process.resourcesPath,
            "backend",
            "dist",
            backendExecutable
        );
    } else {
        backendPath = path.join(
            __dirname,
            "../backend/dist",
            backendExecutable
        );
    }

    console.log("Starting backend from:", backendPath);

    backendProcess = spawn(backendPath, [], {
        shell: false
    });

    backendProcess.stdout.on("data", (data) => {
        console.log(`Backend: ${data.toString()}`);
    });

    backendProcess.stderr.on("data", (data) => {
        console.error(`Backend Error: ${data.toString()}`);
    });

    backendProcess.on("error", (err) => {
        console.error("Failed to start backend:", err);
    });

    backendProcess.on("close", (code) => {
        console.log(`Backend exited with code ${code}`);
    });
}

function createWindow() {

    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        useContentSize: true,
        autoHideMenuBar: true,
        backgroundColor: "#090c10",
        icon: path.join(__dirname, "../frontend/assets/icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        }
    });

    // Allow Google Fonts to load inside Electron.
    // Note: no 'unsafe-inline' / 'unsafe-eval' — script.js is fully
    // external and there are no inline style attributes, so the app
    // doesn't need either. Keeping them out limits what an XSS bug
    // (e.g. unescaped AI/DB content) could actually execute.
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                "Content-Security-Policy": [
                    "default-src 'self'; " +
                    "script-src 'self'; " +
                    "style-src 'self' https://fonts.googleapis.com; " +
                    "connect-src 'self' http://127.0.0.1:8000; " +
                    "font-src 'self' https://fonts.gstatic.com data:; " +
                    "img-src 'self' data:; " +
                    "object-src 'none'; " +
                    "base-uri 'none';"
                ],
            },
        });
    });

    // Deny any attempt to open a new window/tab (e.g. via a target="_blank"
    // link or window.open triggered by injected content) and block
    // navigating the main window away from the app's own files.
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith("file://")) {
            event.preventDefault();
        }
    });

    win.loadFile(path.join(__dirname, "../frontend/index.html"));
}

app.whenReady().then(() => {

    app.setName("LuminaSQL");

    if (process.platform === "darwin") {
        app.dock.setIcon(
            path.join(__dirname, "../frontend/assets/icon.png")
        );
    }

    startBackend();

    // Same 5 second delay as before — keeps original behaviour
    setTimeout(() => {
        createWindow();
    }, 5000);
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

// Re-open window on dock click (macOS)
app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on("will-quit", () => {
    if (backendProcess) {
        console.log("Killing backend...");
        backendProcess.kill();
    }
});