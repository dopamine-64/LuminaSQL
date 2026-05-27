from sqlalchemy import text


def get_schema(engine):

    schema = ""

    with engine.connect() as conn:

        tables = conn.execute(text("SHOW TABLES"))

        for table in tables:

            table_name = list(table)[0]

            schema += f"\nTable: {table_name}\n"

            columns = conn.execute(
                text(f"DESCRIBE {table_name}")
            )

            for column in columns:

                schema += (
                    f"- {column[0]} ({column[1]})\n"
                )

    return schema