@echo off
set DATABASE_URL=sqlite:///./var/arch-admin-cms-verify.db
set ARCH_ENVIRONMENT=development
set ARCH_SECRET_KEY=local-verification-secret-key-32chars!!
set CORS_ORIGINS=http://127.0.0.1:4000,http://localhost:4000,http://127.0.0.1:8090,http://localhost:8090
set ARCH_STORAGE_PROVIDER=local
set ARCH_LOCAL_STORAGE_PATH=./var/verify-storage
set ARCH_LOCAL_PUBLIC_URL=http://127.0.0.1:8000/storage
.venv-verify\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000