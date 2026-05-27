const hostInput = document.getElementById("host");
const portInput = document.getElementById("port");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const databaseInput = document.getElementById("database");

const dbStatus = document.getElementById("dbStatus");
const askBtn = document.getElementById("askBtn");
const questionInput = document.getElementById("question");
const sqlOutput = document.getElementById("sqlOutput");
const resultContainer = document.getElementById("resultContainer");
const loader = document.getElementById("loader");
const explanationBox = document.getElementById("explanationBox");

const API_URL = "http://127.0.0.1:8000/ask";

askBtn.addEventListener("click", async () => {

    const question = questionInput.value.trim();

    if (!question) {
        alert("Please enter a question.");
        return;
    }

    sqlOutput.innerText = "Generating SQL...";
    resultContainer.innerHTML = "<p>Loading...</p>";
    loader.classList.remove("hidden");

    try {

        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                host: hostInput.value,
                port: parseInt(portInput.value),
                username: usernameInput.value,
                password: passwordInput.value,
                database: databaseInput.value,
                question: question
            })
        });

        // 🚨 SAFE CHECK (IMPORTANT)
        let data;

        try {
            const text = await response.text();

            try {
                data = JSON.parse(text);
            } catch (err) {
                throw new Error(text || "Backend returned invalid response");
            }

        } catch (err) {
            loader.classList.add("hidden");
            throw err;
        }

        // HANDLE HTTP ERRORS
        if (!response.ok) {
            throw new Error(data?.error || "Server error");
        }

        if (data.error) {
            loader.classList.add("hidden");
            sqlOutput.innerText = "Error";
            resultContainer.innerHTML = `<p class="error">${data.error}</p>`;
            dbStatus.innerText = "Connection Failed";
            dbStatus.classList.remove("connected");
            return;
        }

        // ONLY now mark connected
        dbStatus.innerText = `Connected to ${databaseInput.value}`;
        dbStatus.classList.add("connected");

        function formatSQL(sql){

        sql=sql
        .replace(/\s+/g," ")
        .replace(/SELECT/gi,"\nSELECT")
        .replace(/FROM/gi,"\nFROM")
        .replace(/LEFT JOIN/gi,"\nLEFT JOIN")
        .replace(/RIGHT JOIN/gi,"\nRIGHT JOIN")
        .replace(/INNER JOIN/gi,"\nINNER JOIN")
        .replace(/WHERE/gi,"\nWHERE")
        .replace(/GROUP BY/gi,"\nGROUP BY")
        .replace(/ORDER BY/gi,"\nORDER BY")
        .replace(/LIMIT/gi,"\nLIMIT")
        .replace(/ON/gi,"\nON")
        .trim();

        sql=sql
        .replace(/\bSELECT\b/gi,'<span class="sql-keyword">SELECT</span>')
        .replace(/\bFROM\b/gi,'<span class="sql-keyword">FROM</span>')
        .replace(/\bWHERE\b/gi,'<span class="sql-keyword">WHERE</span>')
        .replace(/\bLEFT JOIN\b/gi,'<span class="sql-keyword">LEFT JOIN</span>')
        .replace(/\bRIGHT JOIN\b/gi,'<span class="sql-keyword">RIGHT JOIN</span>')
        .replace(/\bINNER JOIN\b/gi,'<span class="sql-keyword">INNER JOIN</span>')
        .replace(/\bGROUP BY\b/gi,'<span class="sql-keyword">GROUP BY</span>')
        .replace(/\bORDER BY\b/gi,'<span class="sql-keyword">ORDER BY</span>')
        .replace(/\bLIMIT\b/gi,'<span class="sql-keyword">LIMIT</span>')
        .replace(/\bON\b/gi,'<span class="sql-keyword">ON</span>');

        return sql;
        }

        function formatExplanation(text){
        return text

        .replace(/\*\*(.*?)\*\*/g,"<b>$1</b>")
        .replace(/`(.*?)`/g,"<code>$1</code>")
        .replace(/\n/g,"<br>");
        }

        dbStatus.innerText =
            `Connected to ${databaseInput.value}`;
        dbStatus.classList.add("connected");
        sqlOutput.innerHTML =
        formatSQL(data.sql || "No SQL generated")

        explanationBox.innerHTML = formatExplanation(
        data.explanation || "No explanation available"
        );

        if (data.sql && isDangerousQuery(data.sql)) {

            const confirmed = confirm(
                "WARNING:\n\nThis query may modify or delete database data.\n\nDo you want to continue?"
            );

            if (!confirmed) {
                sqlOutput.innerText = "Query cancelled.";
                resultContainer.innerHTML = "";
                return;
            }
        }

        renderResults(data.result);
        loader.classList.add("hidden");

    } catch (error) {

        loader.classList.add("hidden");
        dbStatus.innerText = "Connection Failed";
        dbStatus.classList.remove("connected");
        sqlOutput.innerText = "Error generating SQL";
        resultContainer.innerHTML = `
            <p class="error">
                ${error.message}
            </p>
        `;
        console.error(error);
    }
});

function isDangerousQuery(sql) {

    const dangerousKeywords = [
        "DELETE",
        "UPDATE",
        "INSERT",
        "DROP",
        "ALTER",
        "TRUNCATE"
    ];

    const upperSQL = sql.toUpperCase();

    return dangerousKeywords.some(keyword =>
        upperSQL.includes(keyword)
    );
}

function renderResults(results) {

    if (!results) {
        resultContainer.innerHTML =
            "<p>No results found.</p>";
        return;
    }

    if (results.error) {
        resultContainer.innerHTML = `
            <p class="error">${results.error}</p>
        `;
        return;
    }

    if (
        !Array.isArray(results)
        || results.length === 0
    ) {

        resultContainer.innerHTML =
            "<p>No data returned.</p>";
        return;
    }

    const columns = Object.keys(results[0]);

    let tableHTML = `
        <table>
            <thead>
                <tr>
    `;

    columns.forEach(col => {
        tableHTML += `<th>${col}</th>`;
    });

    tableHTML += `
                </tr>
            </thead>
            <tbody>
    `;

    results.forEach(row => {
        tableHTML += "<tr>";
        columns.forEach(col => {

            tableHTML += `
                <td>${row[col]}</td>
            `;
        });

        tableHTML += "</tr>";
    });

    tableHTML += `
            </tbody>
        </table>
    `;
    resultContainer.innerHTML = tableHTML;
}

// SAVE INPUTS

const inputs=[
hostInput,
portInput,
usernameInput,
passwordInput,
databaseInput,
questionInput
];

inputs.forEach(input=>{

const savedValue=
localStorage.getItem(input.id);

if(savedValue!==null){

input.value=savedValue;
}

input.addEventListener("input",()=>{

localStorage.setItem(
input.id,
input.value
);

});

});
