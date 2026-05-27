from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ai import generate_sql, fix_sql, explain_sql
from executor import run_query
from fastapi.responses import JSONResponse

from database_manager import (
    create_db_engine,
    test_connection
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):

    host: str
    port: int

    username: str
    password: str

    database: str

    question: str


@app.post("/ask")
def ask(data: AskRequest):

    try:
        engine = create_db_engine(
            data.host,
            data.port,
            data.username,
            data.password,
            data.database
        )

        if not test_connection(engine):
            return JSONResponse(
                status_code=400,
                content={
                    "sql": "",
                    "result": "Database connection failed",
                    "explanation": "",
                    "fixed": False
                }
            )

        sql = generate_sql(data.question, engine)

        result = run_query(sql, engine)

        explanation = explain_sql(sql)

        fixed = False

        if "error" in result:
            fixed_sql = fix_sql(
                data.question,
                sql,
                result["error"],
                engine
            )

            retry_result = run_query(fixed_sql, engine)

            if "error" not in retry_result:
                sql = fixed_sql
                result = retry_result
                explanation = explain_sql(sql)
                fixed = True

        return {
            "sql": sql,
            "result": result,
            "explanation": explanation,
            "fixed": fixed
        }

    except Exception as e:
        print("❌ Backend crash:", e)

        return JSONResponse(
            status_code=500,
            content={
                "sql": "",
                "result": "Server error",
                "explanation": str(e),
                "fixed": False
            }
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app,host="127.0.0.1",port=8000)