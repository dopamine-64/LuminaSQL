from sqlalchemy import text


def get_schema(engine):
    schema_parts = []

    with engine.connect() as conn:

        # Get current database name
        db_name = conn.execute(text("SELECT DATABASE()")).scalar()
        schema_parts.append(f"DATABASE: {db_name}\n")

        # Get all tables
        tables_result = conn.execute(text("SHOW TABLES"))
        table_names = [list(row)[0] for row in tables_result]

        if not table_names:
            return "DATABASE: (empty — no tables found)"

        for table_name in table_names:
            table_parts = []
            table_parts.append(f"\n┌─ TABLE: `{table_name}`")

            # ── COLUMNS ──────────────────────────────────────────────
            # DESCRIBE gives: Field, Type, Null, Key, Default, Extra
            columns_result = conn.execute(
                text(f"DESCRIBE `{table_name}`")
            )
            columns = columns_result.fetchall()

            col_lines = []
            primary_keys = []
            for col in columns:
                field   = col[0]
                dtype   = col[1]
                null    = col[2]   # YES / NO
                key     = col[3]   # PRI / MUL / UNI / ""
                default = col[4]
                extra   = col[5]   # auto_increment, etc.

                flags = []
                if key == "PRI":
                    flags.append("PRIMARY KEY")
                    primary_keys.append(field)
                elif key == "UNI":
                    flags.append("UNIQUE")
                elif key == "MUL":
                    flags.append("INDEXED")

                if null == "NO":
                    flags.append("NOT NULL")
                if extra:
                    flags.append(extra.upper())
                if default is not None:
                    flags.append(f"DEFAULT={default}")

                flag_str = f"  [{', '.join(flags)}]" if flags else ""
                col_lines.append(f"│  - {field} : {dtype}{flag_str}")

            table_parts.append("│  COLUMNS:")
            table_parts.extend(col_lines)

            # ── ROW COUNT ─────────────────────────────────────────────
            try:
                count_row = conn.execute(
                    text(f"SELECT COUNT(*) FROM `{table_name}`")
                ).scalar()
                table_parts.append(f"│  ROW COUNT: {count_row:,}")
            except Exception:
                pass

            # ── FOREIGN KEYS ──────────────────────────────────────────
            try:
                fk_result = conn.execute(text(f"""
                    SELECT
                        kcu.COLUMN_NAME,
                        kcu.REFERENCED_TABLE_NAME,
                        kcu.REFERENCED_COLUMN_NAME,
                        rc.UPDATE_RULE,
                        rc.DELETE_RULE
                    FROM information_schema.KEY_COLUMN_USAGE kcu
                    JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
                        ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
                        AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
                    WHERE kcu.TABLE_SCHEMA = DATABASE()
                      AND kcu.TABLE_NAME = '{table_name}'
                      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
                """))
                fks = fk_result.fetchall()
                if fks:
                    table_parts.append("│  FOREIGN KEYS:")
                    for fk in fks:
                        table_parts.append(
                            f"│    {fk[0]} → {fk[1]}.{fk[2]}"
                            f"  (ON UPDATE {fk[3]}, ON DELETE {fk[4]})"
                        )
            except Exception:
                pass

            # ── INDEXES ───────────────────────────────────────────────
            try:
                idx_result = conn.execute(
                    text(f"SHOW INDEX FROM `{table_name}`")
                )
                indexes = idx_result.fetchall()
                # group by index name, skip PRIMARY (already shown)
                seen = {}
                for idx in indexes:
                    idx_name   = idx[2]   # Key_name
                    col_name   = idx[4]   # Column_name
                    non_unique = idx[1]   # Non_unique (0=unique)
                    if idx_name == "PRIMARY":
                        continue
                    if idx_name not in seen:
                        seen[idx_name] = {
                            "cols": [],
                            "unique": non_unique == 0
                        }
                    seen[idx_name]["cols"].append(col_name)

                if seen:
                    table_parts.append("│  INDEXES:")
                    for idx_name, info in seen.items():
                        kind = "UNIQUE INDEX" if info["unique"] else "INDEX"
                        cols = ", ".join(info["cols"])
                        table_parts.append(f"│    {kind} `{idx_name}` ({cols})")
            except Exception:
                pass

            # ── SAMPLE DATA (up to 3 rows) ────────────────────────────
            try:
                sample_result = conn.execute(
                    text(f"SELECT * FROM `{table_name}` LIMIT 3")
                )
                sample_rows = sample_result.fetchall()
                col_names = list(sample_result.keys()) if hasattr(sample_result, 'keys') else [c[0] for c in columns]

                if sample_rows:
                    table_parts.append("│  SAMPLE DATA:")
                    header = " | ".join(str(c) for c in col_names)
                    table_parts.append(f"│    {header}")
                    table_parts.append(f"│    {'-' * min(len(header), 60)}")
                    for row in sample_rows:
                        row_str = " | ".join(
                            str(v)[:30] if v is not None else "NULL"
                            for v in row
                        )
                        table_parts.append(f"│    {row_str}")
            except Exception:
                pass

            table_parts.append("└" + "─" * 50)
            schema_parts.append("\n".join(table_parts))

        # ── RELATIONSHIPS SUMMARY ─────────────────────────────────────
        try:
            rel_result = conn.execute(text("""
                SELECT
                    kcu.TABLE_NAME,
                    kcu.COLUMN_NAME,
                    kcu.REFERENCED_TABLE_NAME,
                    kcu.REFERENCED_COLUMN_NAME
                FROM information_schema.KEY_COLUMN_USAGE kcu
                WHERE kcu.TABLE_SCHEMA = DATABASE()
                  AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
                ORDER BY kcu.TABLE_NAME
            """))
            rels = rel_result.fetchall()
            if rels:
                schema_parts.append("\n── RELATIONSHIPS SUMMARY ──")
                for rel in rels:
                    schema_parts.append(
                        f"  {rel[0]}.{rel[1]} → {rel[2]}.{rel[3]}"
                    )
        except Exception:
            pass

    return "\n".join(schema_parts)