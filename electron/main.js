const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

app.setName("LuminaSQL");

let backendProcess;

function startBackend() {

    // Detect executable name
    const backendExecutable =
        process.platform === "win32"
            ? "main.exe"
            : "main";

    let backendPath;

    // PACKAGED APP
    if (app.isPackaged) {

        backendPath = path.join(
            process.resourcesPath,
            "backend",
            "dist",
            backendExecutable
        );

    } else {

        // DEVELOPMENT MODE
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

        backgroundColor: "#000000",

        icon: path.join(
            __dirname,
            "../frontend/assets/icon.png"
        ),

        webPreferences: {
            preload: path.join(
                __dirname,
                "preload.js"
            ),

            nodeIntegration: false,
            contextIsolation: true
        }
    });

    win.loadFile(
        path.join(
            __dirname,
            "../frontend/index.html"
        )
    );
}

app.whenReady().then(() => {

    app.setName("LuminaSQL");

    // macOS dock icon
    if (process.platform === "darwin") {

        app.dock.setIcon(
            path.join(
                __dirname,
                "../frontend/assets/icon.png"
            )
        );
    }

    startBackend();

    setTimeout(() => {
        createWindow();
    }, 5000);
});

app.on("window-all-closed", () => {

    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("will-quit", () => {

    if (backendProcess) {

        console.log("Killing backend...");
        backendProcess.kill();
    }
});