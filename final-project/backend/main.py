import os

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import SampleModel, SampleStatus

app = FastAPI(title="LabSync backend", version="0.1.0")

Base.metadata.create_all(bind=engine)

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


@app.get("/samples")
async def list_samples(status: str | None = None, db: Session = Depends(get_db)):
  stmt = select(SampleModel)
  if status:
    stmt = stmt.where(SampleModel.status == SampleStatus(status))
  rows = db.execute(stmt).scalars().all()
  return [to_sample_out(r) for r in rows]


@app.get("/samples/{sample_id}")
async def get_sample(sample_id: str, db: Session = Depends(get_db)):
  row = db.get(SampleModel, sample_id)
  if not row:
    raise HTTPException(status_code=404, detail="Sample not found")
  return to_sample_out(row)


@app.post("/samples", status_code=201)
async def create_sample(sample: Sample, db: Session = Depends(get_db)):
  existing = db.get(SampleModel, sample.sample_id)
  if existing:
    raise HTTPException(status_code=400, detail="Sample exists")
  row = SampleModel(
    sample_id=sample.sample_id,
    well_id=sample.well_id,
    horizon=sample.horizon,
    sampling_date=sample.sampling_date,
    status=SampleStatus(sample.status),
    storage_location=sample.storage_location,
  )
  db.add(row)
  db.commit()
  db.refresh(row)
  return to_sample_out(row)


@app.patch("/samples/{sample_id}")
async def update_sample(sample_id: str, payload: dict, db: Session = Depends(get_db)):
  row = db.get(SampleModel, sample_id)
  if not row:
    raise HTTPException(status_code=404, detail="Sample not found")
  for key, value in payload.items():
    if key == "status":
      setattr(row, key, SampleStatus(value))
    elif hasattr(row, key):
      setattr(row, key, value)
  db.add(row)
  db.commit()
  db.refresh(row)
  return to_sample_out(row)


def to_sample_out(row: SampleModel):
  return Sample(
    sample_id=row.sample_id,
    well_id=row.well_id,
    horizon=row.horizon,
    sampling_date=row.sampling_date,
    status=row.status.value,
    storage_location=row.storage_location,
  )
