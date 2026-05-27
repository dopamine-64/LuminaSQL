import os
import json
import httpx
from openai import OpenAI
from schema import get_schema

# -----------------------------
# FIXED CONFIG PATH (ONLY ONE SOURCE OF TRUTH)
# -----------------------------

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


# -----------------------------
# OPENAI CLIENT
# -----------------------------

def get_client():
    api_key = get_config_value("OPENAI_API_KEY")
    base_url = get_config_value("OPENAI_BASE_URL")

    if not api_key:
        raise Exception("OPENAI_API_KEY not found")

    return OpenAI(
        api_key=api_key,
        base_url=base_url,
        http_client=httpx.Client(
            headers={"Accept-Encoding": "identity"}
        )
    )


# -----------------------------
# SQL GENERATION
# -----------------------------

def generate_sql(question, engine):
    schema = get_schema(engine)

    prompt = f"""
You are a MySQL expert.

DATABASE SCHEMA:
{schema}

RULES:
- Return ONLY SQL
- Use ONLY existing tables
- Use ONLY existing columns
- Use MySQL syntax
- No markdown
- No explanations

QUESTION:
{question}
"""

    client = get_client()

    response = client.chat.completions.create(
        model="mimo-v2.5-pro",
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    return response.choices[0].message.content.strip()


# -----------------------------
# FIX SQL
# -----------------------------

def fix_sql(question, old_sql, error, engine):
    schema = get_schema(engine)

    prompt = f"""
You are a MySQL expert.

DATABASE SCHEMA:
{schema}

The following SQL failed.

QUESTION:
{question}

FAILED SQL:
{old_sql}

ERROR:
{error}

TASK:
Fix the SQL query.

RULES:
- Return ONLY SQL
- Use ONLY existing tables
- Use ONLY existing columns
- Use MySQL syntax
- No markdown
- No explanations
"""

    client = get_client()

    response = client.chat.completions.create(
        model="mimo-v2.5-pro",
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    return response.choices[0].message.content.strip()


# -----------------------------
# EXPLAIN SQL
# -----------------------------

def explain_sql(sql):
    prompt = f"""
Explain this SQL query in simple English.

Keep it short and beginner friendly.

SQL:
{sql}
"""

    client = get_client()

    response = client.chat.completions.create(
        model="mimo-v2.5-pro",
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    return response.choices[0].message.content.strip()