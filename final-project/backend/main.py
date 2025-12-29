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


class Sample(BaseModel):
  sample_id: str
  well_id: str
  horizon: str
  sampling_date: str
  status: str = "new"
  storage_location: str | None = None


SAMPLE_STORE: dict[str, Sample] = {
  "SMP-2024-0142": Sample(sample_id="SMP-2024-0142", well_id="101", horizon="AV1", sampling_date="2024-12-28", status="new", storage_location="Rack A · Bin 2"),
  "SMP-2024-0143": Sample(sample_id="SMP-2024-0143", well_id="114", horizon="BV3", sampling_date="2024-12-27", status="new", storage_location="Cold room · Shelf 1"),
  "SMP-2024-0138": Sample(sample_id="SMP-2024-0138", well_id="72", horizon="CH1", sampling_date="2024-12-25", status="progress", storage_location="Dispatch counter"),
  "SMP-2024-0135": Sample(sample_id="SMP-2024-0135", well_id="88", horizon="JS2", sampling_date="2024-12-24", status="review", storage_location="Rack B · Bin 4"),
  "SMP-2024-0130": Sample(sample_id="SMP-2024-0130", well_id="64", horizon="AV2", sampling_date="2024-12-20", status="done", storage_location="Rack C · Bin 1"),
}


@app.get("/samples")
async def list_samples(status: str | None = None):
  items = list(SAMPLE_STORE.values())
  if status:
    items = [s for s in items if s.status == status]
  return items


@app.get("/samples/{sample_id}")
async def get_sample(sample_id: str):
  sample = SAMPLE_STORE.get(sample_id)
  if not sample:
    raise HTTPException(status_code=404, detail="Sample not found")
  return sample


@app.post("/samples", status_code=201)
async def create_sample(sample: Sample):
  if sample.sample_id in SAMPLE_STORE:
    raise HTTPException(status_code=400, detail="Sample exists")
  SAMPLE_STORE[sample.sample_id] = sample
  return sample


@app.patch("/samples/{sample_id}")
async def update_sample(sample_id: str, payload: dict):
  existing = SAMPLE_STORE.get(sample_id)
  if not existing:
    raise HTTPException(status_code=404, detail="Sample not found")
  updated = existing.model_copy(update=payload)
  SAMPLE_STORE[sample_id] = updated
  return updated
