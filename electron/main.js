const { app, BrowserWindow, session } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

app.setName("LuminaSQL");

let backendProcess;

// ── Poll backend until it responds ──────────────────────────────
function waitForBackend(retries = 40, interval = 500) {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const check = () => {
            const req = http.get("http://127.0.0.1:8000/health", (res) => {
                if (res.statusCode === 200) {
                    console.log("Backend is ready.");
                    resolve();
                } else {
                    retry();
                }
            });

            req.on("error", () => retry());
            req.setTimeout(400, () => { req.destroy(); retry(); });
        };

        const retry = () => {
            attempts++;
            if (attempts >= retries) {
                reject(new Error("Backend did not start in time."));
            } else {
                setTimeout(check, interval);
            }
        };

        check();
    });
}

// ── Start the compiled Python backend ───────────────────────────
function startBackend() {
    const backendExecutable = process.platform === "win32" ? "main.exe" : "main";

    const backendPath = app.isPackaged
        ? path.join(process.resourcesPath, "backend", "dist", backendExecutable)
        : path.join(__dirname, "../backend/dist", backendExecutable);

    console.log("Starting backend from:", backendPath);

    backendProcess = spawn(backendPath, [], { shell: false });

    backendProcess.stdout.on("data", (d) => console.log(`Backend: ${d.toString().trim()}`));
    backendProcess.stderr.on("data", (d) => console.error(`Backend Error: ${d.toString().trim()}`));
    backendProcess.on("error", (err) => console.error("Failed to start backend:", err));
    backendProcess.on("close", (code) => console.log(`Backend exited with code ${code}`));
}

// ── Create the main window ───────────────────────────────────────
function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        backgroundColor: "#090c10",
        icon: path.join(__dirname, "../frontend/assets/icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
        },
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

// ── App ready ────────────────────────────────────────────────────
app.whenReady().then(async () => {
    app.setName("LuminaSQL");

    // macOS dock icon
    if (process.platform === "darwin") {
        app.dock.setIcon(path.join(__dirname, "../frontend/assets/icon.png"));
    }

    startBackend();

    try {
        await waitForBackend();
    } catch (e) {
        console.error("Backend failed to start:", e.message);
        // Open window anyway — frontend loading screen handles retries
    }

    createWindow();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
    // Re-create window on dock click (macOS standard behaviour)
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("will-quit", () => {
    if (backendProcess) {
        console.log("Killing backend...");
        backendProcess.kill();
    }
});