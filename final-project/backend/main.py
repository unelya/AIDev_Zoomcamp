from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="LabSync backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


class LoginRequest(BaseModel):
  username: str
  password: str


class LoginResponse(BaseModel):
  token: str
  role: str
  full_name: str


ROLE_MAP = {
  "warehouse": "warehouse_worker",
  "lab": "lab_operator",
  "action": "action_supervision",
  "admin": "admin",
}


@app.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest):
  username = payload.username.strip() or "user"
  # pick role based on prefix keyword in username
  role = "lab_operator"
  for key, value in ROLE_MAP.items():
    if key in username.lower():
      role = value
      break
  token = f"fake-{role}-{username}"
  full_name = username.replace(".", " ").title()
  return LoginResponse(token=token, role=role, full_name=full_name)


@app.get("/auth/me", response_model=LoginResponse)
async def me(authorization: str | None = None):
  if not authorization or not authorization.lower().startswith("bearer "):
    raise HTTPException(status_code=401, detail="Unauthorized")
  token = authorization.split(" ", 1)[1]
  parts = token.split("-")
  if len(parts) < 3:
    raise HTTPException(status_code=401, detail="Invalid token")
  role = parts[1]
  username = "-".join(parts[2:]) or "user"
  if role not in ROLE_MAP.values():
    role = "lab_operator"
  full_name = username.replace(".", " ").title()
  return LoginResponse(token=token, role=role, full_name=full_name)
