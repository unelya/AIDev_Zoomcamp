import os
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

# Support running as a module or script
try:
    from .database import Base, engine, get_db
    from .models import ActionBatchModel, ActionBatchStatus, ConflictModel, ConflictStatus, SampleModel, SampleStatus, PlannedAnalysisModel, AnalysisStatus, UserModel
    from .schemas import ActionBatchCreate, ActionBatchOut, ConflictCreate, ConflictOut, ConflictUpdate, PlannedAnalysisCreate, PlannedAnalysisOut, PlannedAnalysisUpdate, UserOut, UserUpdate
    from .seed import seed_users
except ImportError:  # pragma: no cover - fallback for script execution
  from database import Base, engine, get_db  # type: ignore
  from models import ActionBatchModel, ActionBatchStatus, ConflictModel, ConflictStatus, SampleModel, SampleStatus, PlannedAnalysisModel, AnalysisStatus, UserModel  # type: ignore
  from schemas import ActionBatchCreate, ActionBatchOut, ConflictCreate, ConflictOut, ConflictUpdate, PlannedAnalysisCreate, PlannedAnalysisOut, PlannedAnalysisUpdate, UserOut, UserUpdate  # type: ignore
  from seed import seed_users  # type: ignore

app = FastAPI(title="LabSync backend", version="0.1.0")

Base.metadata.create_all(bind=engine)
seed_users()

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
  full_name: str | None = None


class LoginResponse(BaseModel):
  token: str
  role: str
  full_name: str


@app.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest, db: Session = Depends(get_db)):
  username = payload.username.strip() or "user"
  user = db.execute(select(UserModel).where(UserModel.username == username)).scalars().first()
  if not user:
    full_name = payload.full_name or username.replace(".", " ").title()
    user = UserModel(username=username, full_name=full_name, role="lab_operator")
    db.add(user)
    db.commit()
    db.refresh(user)
  token = f"fake-{user.id}"
  return LoginResponse(token=token, role=user.role, full_name=user.full_name)


@app.get("/auth/me", response_model=LoginResponse)
async def me(authorization: str | None = None, db: Session = Depends(get_db)):
  if not authorization or not authorization.lower().startswith("bearer "):
    raise HTTPException(status_code=401, detail="Unauthorized")
  token = authorization.split(" ", 1)[1]
  user_id = None
  if token.startswith("fake-"):
    _, maybe_id = token.split("-", 1)
    user_id = maybe_id
  else:
    user_id = token
  try:
    user_id_int = int(user_id)
  except Exception:
    raise HTTPException(status_code=401, detail="Invalid token")
  user = db.get(UserModel, user_id_int)
  if not user:
    raise HTTPException(status_code=401, detail="Invalid token")
  return LoginResponse(token=token, role=user.role, full_name=user.full_name)


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


@app.get("/planned-analyses")
async def list_planned_analyses(status: str | None = None, db: Session = Depends(get_db)):
  stmt = select(PlannedAnalysisModel)
  if status:
    stmt = stmt.where(PlannedAnalysisModel.status == AnalysisStatus(status))
  rows = db.execute(stmt).scalars().all()
  return [to_planned_out(r) for r in rows]


@app.post("/planned-analyses", response_model=PlannedAnalysisOut, status_code=201)
async def create_planned_analysis(payload: PlannedAnalysisCreate, db: Session = Depends(get_db)):
  row = PlannedAnalysisModel(
    sample_id=payload.sample_id,
    analysis_type=payload.analysis_type,
    assigned_to=payload.assigned_to,
    status=AnalysisStatus.planned,
  )
  db.add(row)
  db.commit()
  db.refresh(row)
  return to_planned_out(row)


@app.patch("/planned-analyses/{analysis_id}", response_model=PlannedAnalysisOut)
async def update_planned_analysis(analysis_id: int, payload: PlannedAnalysisUpdate, db: Session = Depends(get_db)):
  row = db.get(PlannedAnalysisModel, analysis_id)
  if not row:
    raise HTTPException(status_code=404, detail="Planned analysis not found")
  if payload.status:
    row.status = AnalysisStatus(payload.status)
  if payload.assigned_to is not None:
    row.assigned_to = payload.assigned_to
  db.add(row)
  db.commit()
  db.refresh(row)
  return to_planned_out(row)


def to_planned_out(row: PlannedAnalysisModel):
  return {
    "id": row.id,
    "sample_id": row.sample_id,
    "analysis_type": row.analysis_type,
    "status": row.status.value,
    "assigned_to": row.assigned_to,
  }


@app.post("/action-batches", response_model=ActionBatchOut, status_code=201)
async def create_action_batch(payload: ActionBatchCreate, db: Session = Depends(get_db)):
  row = ActionBatchModel(
    title=payload.title,
    date=payload.date,
    status=ActionBatchStatus(payload.status),
  )
  db.add(row)
  db.commit()
  db.refresh(row)
  return to_action_batch_out(row)


@app.get("/action-batches", response_model=list[ActionBatchOut])
async def list_action_batches(db: Session = Depends(get_db)):
  rows = db.execute(select(ActionBatchModel)).scalars().all()
  return [to_action_batch_out(r) for r in rows]


@app.post("/conflicts", response_model=ConflictOut, status_code=201)
async def create_conflict(payload: ConflictCreate, db: Session = Depends(get_db)):
  row = ConflictModel(
    old_payload=payload.old_payload,
    new_payload=payload.new_payload,
    status=ConflictStatus(payload.status),
  )
  db.add(row)
  db.commit()
  db.refresh(row)
  return to_conflict_out(row)

@app.get("/conflicts", response_model=list[ConflictOut])
async def list_conflicts(db: Session = Depends(get_db)):
  rows = db.execute(select(ConflictModel)).scalars().all()
  return [to_conflict_out(r) for r in rows]


@app.patch("/conflicts/{conflict_id}", response_model=ConflictOut)
async def update_conflict(conflict_id: int, payload: ConflictUpdate, db: Session = Depends(get_db), authorization: str | None = None):
  row = db.get(ConflictModel, conflict_id)
  if not row:
    raise HTTPException(status_code=404, detail="Conflict not found")
  if payload.status:
    row.status = ConflictStatus(payload.status)
  if payload.resolution_note is not None:
    row.resolution_note = payload.resolution_note
  row.updated_at = datetime.utcnow().isoformat()
  if authorization and authorization.lower().startswith("bearer "):
    row.updated_by = authorization.split(" ", 1)[1]
  db.add(row)
  db.commit()
  db.refresh(row)
  return to_conflict_out(row)


def to_action_batch_out(row: ActionBatchModel):
  return {"id": row.id, "title": row.title, "date": row.date, "status": row.status.value}


def to_conflict_out(row: ConflictModel):
  return {
    "id": row.id,
    "old_payload": row.old_payload,
    "new_payload": row.new_payload,
    "status": row.status.value,
    "resolution_note": row.resolution_note,
    "updated_by": row.updated_by,
    "updated_at": row.updated_at,
  }


@app.get("/admin/users", response_model=list[UserOut])
async def list_users(db: Session = Depends(get_db)):
  rows = db.execute(select(UserModel)).scalars().all()
  return [UserOut(id=r.id, username=r.username, full_name=r.full_name, role=r.role) for r in rows]


@app.patch("/admin/users/{user_id}", response_model=UserOut)
async def update_user_role(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)):
  row = db.get(UserModel, user_id)
  if not row:
    raise HTTPException(status_code=404, detail="User not found")
  row.role = payload.role
  db.add(row)
  db.commit()
  db.refresh(row)
  return UserOut(id=row.id, username=row.username, full_name=row.full_name, role=row.role)
