const { app, BrowserWindow, session } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

app.setName("LuminaSQL");

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
        backgroundColor: "#090c10",
        icon: path.join(__dirname, "../frontend/assets/icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Allow Google Fonts to load inside Electron
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                "Content-Security-Policy": [
                    "default-src 'self' 'unsafe-inline' 'unsafe-eval' " +
                    "http://127.0.0.1:8000 " +
                    "https://fonts.googleapis.com " +
                    "https://fonts.gstatic.com; " +
                    "font-src 'self' https://fonts.gstatic.com data:; " +
                    "img-src 'self' data:;"
                ],
            },
        });
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