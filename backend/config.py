import os
import json

CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".ai-db-assistant")
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")


def load_config():
    if not os.path.exists(CONFIG_PATH):
        return {}

    with open(CONFIG_PATH, "r") as f:
        return json.load(f)


def get_config_value(key):
    config = load_config()
    return config.get(key)


def save_config(data):
    os.makedirs(CONFIG_DIR, exist_ok=True)

    config = load_config()
    config.update(data)

    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)

    print("Config saved at:", CONFIG_PATH)