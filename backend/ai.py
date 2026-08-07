import os
import re
import json
import requests
from schema import get_schema

# ================================================================
# CONFIG
# ================================================================

CONFIG_PATH = os.path.join(
    os.path.expanduser("~"),
    ".ai-db-assistant",
    "config.json"
)

_cached_config = None


def load_config():
    global _cached_config
    if _cached_config is not None:
        return _cached_config

    print("CONFIG PATH:", CONFIG_PATH)
    print("EXISTS:", os.path.exists(CONFIG_PATH))

    if not os.path.exists(CONFIG_PATH):
        print("❌ Config file not found at:", CONFIG_PATH)
        _cached_config = {}
        return _cached_config

    try:
        with open(CONFIG_PATH, "r") as f:
            _cached_config = json.load(f)
            return _cached_config
    except Exception as e:
        print("Config load error:", e)
        _cached_config = {}
        return _cached_config


def get_config_value(key):
    return load_config().get(key)


# ================================================================
# MODEL
# ================================================================

OPENROUTER_MODEL = "poolside/laguna-xs-2.1:free"


# ================================================================
# API KEY ROTATION
#
# Priority order (highest → lowest):
#   1. Key entered by user in the frontend (passed per-request)
#   2. OPENROUTER_API_KEY   in config.json  ← your primary key
#   3. OPENROUTER_API_KEY_2 in config.json  ← your fallback key
#
# HOW TO ADD A SECOND KEY:
#   Open ~/.ai-db-assistant/config.json and add:
#   {
#       "OPENROUTER_API_KEY":   "sk-or-v1-aaa...",
#       "OPENROUTER_API_KEY_2": "sk-or-v1-bbb..."
#   }
#   Need a third? Add "OPENROUTER_API_KEY_3" and append it below.
# ================================================================

def get_api_keys(user_key: str = "") -> list:
    keys = []

    # 1. User-supplied key from the frontend always goes first
    if user_key and user_key.strip():
        keys.append(user_key.strip())

    # 2. Config keys — add more entries here if you have more keys
    for config_key_name in ["OPENROUTER_API_KEY", "OPENROUTER_API_KEY_2"]:
        val = get_config_value(config_key_name)
        if val and val.strip() and val.strip() not in keys:
            keys.append(val.strip())

    return keys


# ================================================================
# OPENROUTER CALLER  (pure requests — no OpenAI SDK)
# ================================================================

# These HTTP codes mean the key hit its quota → try the next one
_QUOTA_CODES = {429, 402, 403}


def call_openrouter(messages: list, user_key: str = "") -> str:
    keys = get_api_keys(user_key)

    if not keys:
        raise Exception(
            "No OpenRouter API key available. "
            "Either enter your key in the app or add OPENROUTER_API_KEY to config.json."
        )

    last_error = None

    for idx, api_key in enumerate(keys, start=1):
        # Label for logging
        if idx == 1 and user_key and user_key.strip():
            label = "user-supplied key"
        else:
            label = f"config key #{idx if not (user_key and user_key.strip()) else idx - 1}"

        print(f"[OpenRouter] Trying {label} → model: {OPENROUTER_MODEL}")

        try:
            response = requests.post(
                url="https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type":  "application/json",
                },
                data=json.dumps({
                    "model":     OPENROUTER_MODEL,
                    "messages":  messages,
                    "reasoning": {"enabled": True},
                }),
                timeout=90,
            )

            # Quota / rate-limit hit → rotate to next key
            if response.status_code in _QUOTA_CODES:
                last_error = f"HTTP {response.status_code} (quota/rate-limit)"
                print(f"[OpenRouter] {label} exhausted ({last_error}), rotating...")
                continue

            if response.status_code != 200:
                raise Exception(f"OpenRouter HTTP {response.status_code}: {response.text}")

            data    = response.json()
            content = data["choices"][0]["message"].get("content", "")

            if not content:
                raise Exception("Empty response from OpenRouter / Laguna")

            print(f"[OpenRouter] ✓ Success with {label} — {len(content)} chars")
            return content.strip()

        except requests.exceptions.Timeout:
            last_error = f"{label} timed out"
            print(f"[OpenRouter] {last_error}, rotating...")
            continue

    raise Exception(
        f"All OpenRouter API keys exhausted. Last error: {last_error}. "
        "Add another key as OPENROUTER_API_KEY_2 in config.json, "
        "or enter a fresh key in the app."
    )


# ================================================================
# CORE AI CALLER
# ================================================================

def ask_ai(messages: list, user_key: str = "") -> str:
    return call_openrouter(messages, user_key)


# ================================================================
# SQL GENERATION
# ================================================================

def generate_sql(question: str, engine, user_key: str = "") -> str:
    schema = get_schema(engine)

    column_mentions = re.findall(r"- (\w+) :", schema)
    table_mentions  = re.findall(r"TABLE: `(\w+)`", schema)
    grounding_hint  = ""
    if table_mentions:
        grounding_hint = f"\nKNOWN TABLES: {', '.join(table_mentions)}"
    if column_mentions:
        grounding_hint += f"\nKNOWN COLUMNS (sample): {', '.join(column_mentions[:40])}"

    prompt = f"""You are a strict MySQL query generator. Your only job is to output a single valid MySQL SELECT query.

DATABASE SCHEMA:
{schema}
{grounding_hint}

STRICT RULES — follow every one or the query will be rejected:
1. Output ONLY the raw SQL query. Nothing else. No explanations, no markdown, no code fences, no backticks around the query.
2. NEVER invent, guess, or assume any table name or column name. Use ONLY names that appear verbatim in the DATABASE SCHEMA above.
3. If the question says "show all" or "list all" or "get all", use SELECT * FROM <table> unless specific columns are requested.
4. If the question is ambiguous about which table to use, pick the most relevant one from KNOWN TABLES.
5. Always write valid MySQL syntax. Do NOT use backticks around any identifiers.
6. Never add a semicolon at the end.

EXAMPLES (for style only — do not copy table/column names from these):
  Q: show all records from users         → SELECT * FROM users
  Q: show all products                   → SELECT * FROM products
  Q: show customers from Dhaka           → SELECT * FROM customers WHERE city = 'Dhaka'
  Q: count orders per customer           → SELECT customer_id, COUNT(*) AS order_count FROM orders GROUP BY customer_id
  Q: show top 5 employees by salary      → SELECT * FROM employees ORDER BY salary DESC LIMIT 5

QUESTION: {question}

SQL:"""

    return ask_ai([{"role": "user", "content": prompt}], user_key)


# ================================================================
# FIX SQL
# ================================================================

def fix_sql(question: str, old_sql: str, error: str, engine, user_key: str = "") -> str:
    schema = get_schema(engine)

    table_mentions  = re.findall(r"TABLE: `(\w+)`", schema)
    column_mentions = re.findall(r"- (\w+) :", schema)
    grounding_hint  = ""
    if table_mentions:
        grounding_hint = f"\nKNOWN TABLES: {', '.join(table_mentions)}"
    if column_mentions:
        grounding_hint += f"\nKNOWN COLUMNS (sample): {', '.join(column_mentions[:40])}"

    prompt = f"""You are a strict MySQL query fixer.

DATABASE SCHEMA:
{schema}
{grounding_hint}

The query below failed. Fix it so it runs correctly.

ORIGINAL QUESTION: {question}

FAILED SQL:
{old_sql}

ERROR:
{error}

STRICT RULES:
1. Output ONLY the corrected raw SQL query. No explanations, no markdown, no code fences.
2. NEVER invent or guess any table or column name. Use ONLY names that appear verbatim in the DATABASE SCHEMA above.
3. The fix must directly answer the original question.
4. Use valid MySQL syntax. Do NOT use backticks around any identifiers.
5. Never add a semicolon at the end.

FIXED SQL:"""

    return ask_ai([{"role": "user", "content": prompt}], user_key)


# ================================================================
# EXPLAIN SQL
# ================================================================

def explain_sql(sql: str, user_key: str = "") -> str:
    prompt = f"""Explain this SQL query in simple English. Keep it short and beginner friendly. Do not repeat the SQL itself.

SQL:
{sql}"""

    return ask_ai([{"role": "user", "content": prompt}], user_key)