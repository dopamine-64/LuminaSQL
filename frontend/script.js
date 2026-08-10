/* ============================================================
   LuminaSQL – script.js
   ============================================================ */

const hostInput       = document.getElementById("host");
const portInput       = document.getElementById("port");
const usernameInput   = document.getElementById("username");
const passwordInput   = document.getElementById("password");
const databaseInput   = document.getElementById("database");
const userApiKeyInput = document.getElementById("userApiKey");
const toggleApiKeyBtn = document.getElementById("toggleApiKey");
const dbStatus        = document.getElementById("dbStatus");
const statusText      = dbStatus.querySelector(".status-text");
const askBtn          = document.getElementById("askBtn");
const questionInput   = document.getElementById("question");
const sqlOutput       = document.getElementById("sqlOutput");
const resultContainer = document.getElementById("resultContainer");
const loader          = document.getElementById("loader");
const explanationBox  = document.getElementById("explanationBox");
const copyBtn         = document.getElementById("copyBtn");
const rowCount        = document.getElementById("rowCount");
const appContainer    = document.querySelector(".container");

const API_URL = "http://127.0.0.1:8000/ask";

// -------------------------------------------------------
// HTML ESCAPING — every value that came from the AI, the
// database, or anywhere outside this file's own literals
// MUST pass through this before touching innerHTML.
// -------------------------------------------------------

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// -------------------------------------------------------
// BOOT – wait for backend, then reveal UI
// -------------------------------------------------------

async function waitForBackend() {
    const loadingScreen = document.getElementById("loadingScreen");

    while (true) {
        try {
            const res = await fetch("http://127.0.0.1:8000/health");
            if (res.ok) break;
        } catch (e) {
            // still waiting
        }
        await new Promise(r => setTimeout(r, 500));
    }

    loadingScreen.classList.add("fade-out");
    setTimeout(() => {
        loadingScreen.style.display = "none";
        appContainer.style.display = "block";
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                appContainer.classList.add("visible");
            });
        });
    }, 500);
}

waitForBackend();


// -------------------------------------------------------
// PERSIST INPUTS
// Password excluded for security. API key saved locally
// since it's the user's own key they chose to enter.
// -------------------------------------------------------

const persistedInputs = [hostInput, portInput, usernameInput, databaseInput, questionInput, userApiKeyInput];

persistedInputs.forEach(input => {
    const saved = localStorage.getItem(input.id);
    if (saved !== null) input.value = saved;
    input.addEventListener("input", () => localStorage.setItem(input.id, input.value));
});


// -------------------------------------------------------
// API KEY FAB – open / close popover
// -------------------------------------------------------

const apiKeyFab     = document.getElementById("apiKeyFab");
const apiKeyPopover = document.getElementById("apiKeyPopover");
const apiKeyClose   = document.getElementById("apiKeyClose");
const popoverStatus = document.getElementById("popoverStatus");

function openPopover() {
    apiKeyPopover.classList.remove("hidden");
    apiKeyFab.classList.add("active");
    userApiKeyInput.focus();
}

function closePopover() {
    apiKeyPopover.classList.add("hidden");
    apiKeyFab.classList.remove("active");
    // Show saved indicator on the FAB if a key is set
    if (userApiKeyInput.value.trim()) {
        apiKeyFab.style.borderColor = "rgba(93,223,45,0.6)";
    } else {
        apiKeyFab.style.borderColor = "";
    }
}

apiKeyFab.addEventListener("click", () => {
    apiKeyPopover.classList.contains("hidden") ? openPopover() : closePopover();
});

apiKeyClose.addEventListener("click", closePopover);

// Close on outside click
document.addEventListener("click", (e) => {
    if (!apiKeyFab.contains(e.target) && !apiKeyPopover.contains(e.target)) {
        if (!apiKeyPopover.classList.contains("hidden")) closePopover();
    }
});

// Show/hide key toggle
toggleApiKeyBtn.addEventListener("click", () => {
    const isPassword = userApiKeyInput.type === "password";
    userApiKeyInput.type = isPassword ? "text" : "password";
    toggleApiKeyBtn.querySelector(".eye-icon").classList.toggle("hidden", isPassword);
    toggleApiKeyBtn.querySelector(".eye-off-icon").classList.toggle("hidden", !isPassword);
});

// Show green border on FAB if a saved key exists on load
window.addEventListener("DOMContentLoaded", () => {
    if (userApiKeyInput.value.trim()) {
        apiKeyFab.style.borderColor = "rgba(93,223,45,0.6)";
    }
});


// -------------------------------------------------------
// DANGEROUS QUERY CHECK
// -------------------------------------------------------

function isDangerousQuery(sql) {
    const dangerous = ["DELETE", "UPDATE", "INSERT", "DROP", "ALTER", "TRUNCATE"];
    return dangerous.some(kw => sql.toUpperCase().includes(kw));
}


// -------------------------------------------------------
// SQL FORMATTER – newlines + syntax highlighting
// -------------------------------------------------------

function formatSQL(raw) {
    let sql = raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const clauses = [
        "SELECT","FROM","LEFT\\s+OUTER\\s+JOIN","RIGHT\\s+OUTER\\s+JOIN",
        "LEFT\\s+JOIN","RIGHT\\s+JOIN","INNER\\s+JOIN","CROSS\\s+JOIN","JOIN",
        "WHERE","GROUP\\s+BY","ORDER\\s+BY","HAVING","LIMIT","OFFSET","UNION\\s+ALL",
        "UNION","EXCEPT","INTERSECT","ON","SET"
    ];

    clauses.forEach(clause => {
        sql = sql.replace(new RegExp(`\\b(${clause})\\b`, "gi"), "\n$1");
    });

    sql = sql.replace(/^\n/, "").trim();

    const keywords = [
        "SELECT","DISTINCT","FROM","WHERE","AND","OR","NOT","IN","EXISTS","BETWEEN",
        "LIKE","IS","NULL","AS","ON","JOIN","LEFT","RIGHT","INNER","OUTER","CROSS",
        "FULL","GROUP\\s+BY","ORDER\\s+BY","HAVING","LIMIT","OFFSET","UNION","ALL",
        "EXCEPT","INTERSECT","INSERT","INTO","VALUES","UPDATE","SET","DELETE","CREATE",
        "TABLE","INDEX","VIEW","DROP","ALTER","ADD","COLUMN","PRIMARY","KEY","FOREIGN",
        "REFERENCES","CONSTRAINT","DEFAULT","UNIQUE","CHECK","AUTO_INCREMENT",
        "CASE","WHEN","THEN","ELSE","END","WITH","OVER","PARTITION\\s+BY","WINDOW",
        "ROW_NUMBER","RANK","DENSE_RANK","ASC","DESC","BY"
    ];

    keywords.forEach(kw => {
        sql = sql.replace(
            new RegExp(`\\b(${kw})\\b`, "gi"),
            `<span class="sql-keyword">$1</span>`
        );
    });

    const funcs = ["COUNT","SUM","AVG","MIN","MAX","COALESCE","NULLIF","IFNULL",
                   "CONCAT","LENGTH","TRIM","UPPER","LOWER","SUBSTR","SUBSTRING",
                   "ROUND","FLOOR","CEIL","NOW","DATE","YEAR","MONTH","DAY","CAST","CONVERT"];
    funcs.forEach(fn => {
        sql = sql.replace(
            new RegExp(`\\b(${fn})\\b(?=\\s*\\()`, "gi"),
            `<span class="sql-fn">$1</span>`
        );
    });

    sql = sql.replace(/'([^']*)'/g, `<span class="sql-str">'$1'</span>`);
    sql = sql.replace(/\b(\d+(\.\d+)?)\b/g, `<span class="sql-num">$1</span>`);
    sql = sql.replace(/(--[^\n]*)/g, `<span class="sql-comment">$1</span>`);

    return sql;
}


// -------------------------------------------------------
// EXPLANATION FORMATTER
// -------------------------------------------------------

function formatExplanation(text) {
    // Escape first so any HTML-like content in the AI's response is
    // rendered as inert text, not live markup — then layer the
    // markdown-style formatting on top of the now-safe text.
    return escapeHtml(text)
        .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
        .replace(/\*(.*?)\*/g,     "<em>$1</em>")
        .replace(/`(.*?)`/g,       "<code>$1</code>")
        .replace(/\n/g,            "<br>");
}


// -------------------------------------------------------
// RENDER RESULTS TABLE
// -------------------------------------------------------

function renderResults(results) {
    rowCount.classList.add("hidden");

    if (!results) {
        resultContainer.innerHTML = '<p class="placeholder-text">No results found.</p>';
        return;
    }
    if (results.error) {
        resultContainer.innerHTML = `<p class="error">${escapeHtml(results.error)}</p>`;
        return;
    }
    if (typeof results === "string") {
        resultContainer.innerHTML = `<p class="placeholder-text">${escapeHtml(results)}</p>`;
        return;
    }
    if (!Array.isArray(results) || results.length === 0) {
        resultContainer.innerHTML = '<p class="placeholder-text">Query executed successfully. No rows returned.</p>';
        return;
    }

    const columns = Object.keys(results[0]);
    let html = `<table><thead><tr>`;
    columns.forEach(col => { html += `<th>${escapeHtml(col)}</th>`; });
    html += `</tr></thead><tbody>`;
    results.forEach(row => {
        html += "<tr>";
        columns.forEach(col => {
            const val = row[col];
            html += `<td>${val !== null ? escapeHtml(val) : "<em>NULL</em>"}</td>`;
        });
        html += "</tr>";
    });
    html += `</tbody></table>`;
    resultContainer.innerHTML = html;

    rowCount.textContent = `${results.length} row${results.length !== 1 ? "s" : ""}`;
    rowCount.classList.remove("hidden");
}


// -------------------------------------------------------
// COPY SQL BUTTON
// -------------------------------------------------------

let rawSQLText = "";

copyBtn.addEventListener("click", async () => {
    if (!rawSQLText) return;

    try {
        await navigator.clipboard.writeText(rawSQLText);
    } catch {
        const ta = document.createElement("textarea");
        ta.value = rawSQLText;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
    }

    const copyIcon  = copyBtn.querySelector(".copy-icon");
    const checkIcon = copyBtn.querySelector(".check-icon");
    const copyLabel = copyBtn.querySelector(".copy-label");

    copyIcon.classList.add("hidden");
    checkIcon.classList.remove("hidden");
    copyLabel.textContent = "Copied!";
    copyBtn.classList.add("copied");

    setTimeout(() => {
        copyIcon.classList.remove("hidden");
        checkIcon.classList.add("hidden");
        copyLabel.textContent = "Copy";
        copyBtn.classList.remove("copied");
    }, 2000);
});


// -------------------------------------------------------
// HELPERS
// -------------------------------------------------------

function getBasePayload(question = "") {
    return {
        host:         hostInput.value,
        port:         parseInt(portInput.value),
        username:     usernameInput.value,
        password:     passwordInput.value,
        database:     databaseInput.value,
        question:     question,
        user_api_key: userApiKeyInput.value.trim()
    };
}

async function fetchJSON(url, payload) {
    const res  = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload)
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(text || "Backend returned an invalid response"); }
    if (!res.ok) throw new Error(data?.error || data?.explanation || data?.result || "Server error");
    return data;
}

// Custom modal — replaces browser confirm() for dangerous query warning
function showDangerModal(sql) {
    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.className = "danger-overlay";
        overlay.innerHTML = `
            <div class="danger-modal">
                <div class="danger-icon">⚠️</div>
                <h3 class="danger-title">Warning</h3>
                <p class="danger-desc">This query may <strong>modify or delete</strong> data and cannot be undone.</p>
                <div class="danger-sql">${sql.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
                <div class="danger-actions">
                    <button class="danger-cancel" id="dangerCancel">Cancel</button>
                    <button class="danger-confirm" id="dangerConfirm">Yes, Execute</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add("visible"));

        const cleanup = (result) => {
            overlay.classList.remove("visible");
            setTimeout(() => document.body.removeChild(overlay), 250);
            resolve(result);
        };

        document.getElementById("dangerConfirm").onclick = () => cleanup(true);
        document.getElementById("dangerCancel").onclick  = () => cleanup(false);
        overlay.addEventListener("click", e => { if (e.target === overlay) cleanup(false); });
    });
}


// -------------------------------------------------------
// MAIN – Two-step: Generate first, warn if dangerous, then Execute
// -------------------------------------------------------

askBtn.addEventListener("click", async () => {

    const question = questionInput.value.trim();
    if (!question) { alert("Please enter a question."); return; }

    // Reset UI
    sqlOutput.innerHTML       = '<span class="placeholder-text">Generating SQL...</span>';
    explanationBox.innerHTML  = '<span class="placeholder-text">Thinking...</span>';
    resultContainer.innerHTML = '<p class="placeholder-text">Loading...</p>';
    rowCount.classList.add("hidden");
    rawSQLText = "";
    loader.classList.remove("hidden");
    askBtn.disabled = true;

    try {
        // ── STEP 1: Generate SQL only (no execution) ──────────────
        const genData = await fetchJSON(
            "http://127.0.0.1:8000/generate",
            getBasePayload(question)
        );

        if (genData.error) {
            throw new Error(genData.error);
        }

        const sql = genData.sql || "";
        const explanation = genData.explanation || "";

        // Show the generated SQL + explanation immediately
        rawSQLText = sql;
        sqlOutput.innerHTML = formatSQL(sql || "No SQL generated");
        explanationBox.innerHTML = formatExplanation(explanation || "No explanation available.");
        statusText.textContent = `Connected · ${databaseInput.value}`;
        dbStatus.classList.add("connected");

        // ── STEP 2: Dangerous query gate — warn BEFORE execution ──
        if (genData.dangerous) {
            loader.classList.add("hidden");
            askBtn.disabled = false;
            explanationBox.innerHTML  = '<span class="placeholder-text">Waiting for confirmation...</span>';
            resultContainer.innerHTML = '<p class="placeholder-text">Waiting for confirmation...</p>';

            const confirmed = await showDangerModal(sql);

            if (!confirmed) {
                resultContainer.innerHTML = '<p class="placeholder-text">Execution cancelled by user.</p>';
                explanationBox.innerHTML  = '<span class="placeholder-text">Cancelled.</span>';
                return;
            }

            // Re-enable loader for execution phase
            loader.classList.remove("hidden");
            askBtn.disabled = true;
        }

        // ── STEP 3: Execute ────────────────────────────────────────
        const execData = await fetchJSON(
            "http://127.0.0.1:8000/execute",
            { ...getBasePayload(question), sql, explanation }
        );

        loader.classList.add("hidden");
        askBtn.disabled = false;

        // Update SQL in case auto-fix changed it
        rawSQLText = execData.sql || sql;
        sqlOutput.innerHTML = formatSQL(execData.sql || sql);

        if (execData.fixed) {
            sqlOutput.innerHTML += `<div class="fixed-badge">⚡ Auto-fixed</div>`;
        }

        explanationBox.innerHTML = formatExplanation(execData.explanation || "No explanation available.");
        renderResults(execData.result);

    } catch (error) {
        loader.classList.add("hidden");
        askBtn.disabled = false;
        statusText.textContent    = "Connection Failed";
        dbStatus.classList.remove("connected");
        sqlOutput.innerHTML       = '<span class="placeholder-text">Error generating SQL</span>';
        resultContainer.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
        console.error("[LuminaSQL] Error:", error);
    }
});