from sqlalchemy import text


def run_query(sql, engine):

    try:

        with engine.connect() as conn:

            result = conn.execute(text(sql))

            if result.returns_rows:

                rows = result.fetchall()

                return [
                    dict(row._mapping)
                    for row in rows
                ]

            conn.commit()

            return {
                "message":
                "Query executed successfully"
            }

    except Exception as e:

        return {
            "error": str(e)
        }