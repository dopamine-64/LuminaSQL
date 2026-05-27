from sqlalchemy import create_engine

def create_db_engine(
    host,
    port,
    username,
    password,
    database
):

    if password:

        DATABASE_URL = (
            f"mysql+pymysql://{username}:{password}"
            f"@{host}:{port}/{database}"
        )

    else:

        DATABASE_URL = (
            f"mysql+pymysql://{username}"
            f"@{host}:{port}/{database}"
        )

    engine = create_engine(DATABASE_URL)

    return engine

from sqlalchemy import text


def test_connection(engine):

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        return True

    except Exception:
        return False