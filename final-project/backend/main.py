import os
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select, distinct
from sqlalchemy.orm import Session

# Support running as a module or script
try:
    from .database import Base, engine, get_db
    from .models import ActionBatchModel, ActionBatchStatus, AuditLogModel, ConflictModel, ConflictStatus, SampleModel, SampleStatus, PlannedAnalysisModel, AnalysisStatus, UserModel
    from .schemas import ActionBatchCreate, ActionBatchOut, ConflictCreate, ConflictOut, ConflictUpdate, PlannedAnalysisCreate, PlannedAnalysisOut, PlannedAnalysisUpdate, UserOut, UserUpdate
    from .seed import seed_users
except ImportError:  # pragma: no cover - fallback for script execution
  from database import Base, engine, get_db  # type: ignore
  from models import ActionBatchModel, ActionBatchStatus, AuditLogModel, ConflictModel, ConflictStatus, SampleModel, SampleStatus, PlannedAnalysisModel, AnalysisStatus, UserModel  # type: ignore
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
  roles: list[str]
  full_name: str


@app.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest, db: Session = Depends(get_db)):
  username = payload.username.strip() or "user"
  user = db.execute(select(UserModel).where(UserModel.username == username)).scalars().first()
  if not user:
    full_name = payload.full_name or username.replace(".", " ").title()
    user = UserModel(username=username, full_name=full_name, role="warehouse_worker", roles="warehouse_worker")
    db.add(user)
    db.commit()
    db.refresh(user)
  token = f"fake-{user.id}"
  roles = parse_roles(user.roles)
  return LoginResponse(token=token, role=roles[0] if roles else user.role, roles=roles, full_name=user.full_name)


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
  roles = parse_roles(user.roles)
  return LoginResponse(token=token, role=roles[0] if roles else user.role, roles=roles, full_name=user.full_name)


class Sample(BaseModel):
  sample_id: str
  well_id: str
  horizon: str
  sampling_date: str
  status: str = "new"
  storage_location: str | None = None
  assigned_to: str | None = None


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
    assigned_to=sample.assigned_to,
  )
  db.add(row)
  db.commit()
  db.refresh(row)
  return to_sample_out(row)


@app.patch("/samples/{sample_id}")
async def update_sample(sample_id: str, payload: dict, request: Request, db: Session = Depends(get_db)):
  row = db.get(SampleModel, sample_id)
  if not row:
    raise HTTPException(status_code=404, detail="Sample not found")
  old_status = row.status.value
  for key, value in payload.items():
    if key == "status":
      setattr(row, key, SampleStatus(value))
    elif key == "assigned_to":
      setattr(row, key, value)
    elif hasattr(row, key):
      setattr(row, key, value)
  db.add(row)
  db.commit()
  db.refresh(row)
  if "status" in payload:
    actor = request.headers.get("x-user")
    log_audit(db, entity_type="sample", entity_id=sample_id, action="status_change", performed_by=actor, details=f"{old_status}->{payload['status']}")
  return to_sample_out(row)


def to_sample_out(row: SampleModel):
  return Sample(
    sample_id=row.sample_id,
    well_id=row.well_id,
    horizon=row.horizon,
    sampling_date=row.sampling_date,
    status=row.status.value,
    storage_location=row.storage_location,
    assigned_to=row.assigned_to,
  )


@app.get("/planned-analyses")
async def list_planned_analyses(status: str | None = None, db: Session = Depends(get_db)):
  stmt = select(PlannedAnalysisModel)
  if status:
    stmt = stmt.where(PlannedAnalysisModel.status == AnalysisStatus(status))
  rows = db.execute(stmt).scalars().all()
  return [to_planned_out(r) for r in rows]


@app.post("/planned-analyses", response_model=PlannedAnalysisOut, status_code=201)
async def create_planned_analysis(payload: PlannedAnalysisCreate, request: Request, db: Session = Depends(get_db)):
  default_allowed = {"SARA", "IR", "NMR", "Mass Spectrometry", "Viscosity"}
  existing_types = {r[0] for r in db.execute(select(distinct(PlannedAnalysisModel.analysis_type))).all()}
  allowed = default_allowed  # only these five are allowed globally
  name = payload.analysis_type.strip()
  if not name:
    raise HTTPException(status_code=400, detail="Analysis type required")
  if name not in allowed:
    raise HTTPException(status_code=403, detail="Only these analysis types are allowed: SARA, IR, NMR, Mass Spectrometry, Viscosity")
  row = PlannedAnalysisModel(
    sample_id=payload.sample_id,
    analysis_type=name,
    assigned_to=payload.assigned_to,
    status=AnalysisStatus.planned,
  )
  db.add(row)
  db.commit()
  db.refresh(row)
  return to_planned_out(row)


@app.patch("/planned-analyses/{analysis_id}", response_model=PlannedAnalysisOut)
async def update_planned_analysis(analysis_id: int, payload: PlannedAnalysisUpdate, request: Request, db: Session = Depends(get_db)):
  row = db.get(PlannedAnalysisModel, analysis_id)
  if not row:
    raise HTTPException(status_code=404, detail="Planned analysis not found")
  old_status = row.status.value
  if payload.status:
    row.status = AnalysisStatus(payload.status)
  if payload.assigned_to is not None:
    row.assigned_to = payload.assigned_to
  db.add(row)
  db.commit()
  db.refresh(row)
  if payload.status:
    actor = request.headers.get("x-user")
    log_audit(db, entity_type="planned_analysis", entity_id=str(analysis_id), action="status_change", performed_by=actor, details=f"{old_status}->{payload.status}")
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
async def update_conflict(conflict_id: int, payload: ConflictUpdate, request: Request, db: Session = Depends(get_db), authorization: str | None = None):
  row = db.get(ConflictModel, conflict_id)
  if not row:
    raise HTTPException(status_code=404, detail="Conflict not found")
  old_status = row.status.value
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
  if payload.status:
    actor = request.headers.get("x-user") or row.updated_by
    log_audit(db, entity_type="conflict", entity_id=str(conflict_id), action="status_change", performed_by=actor, details=f"{old_status}->{payload.status}")
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


def log_audit(db: Session, *, entity_type: str, entity_id: str, action: str, performed_by: str | None, details: str | None = None):
  log_row = AuditLogModel(
    entity_type=entity_type,
    entity_id=entity_id,
    action=action,
    performed_by=performed_by,
    performed_at=datetime.utcnow().isoformat(),
    details=details,
  )
  db.add(log_row)
  db.commit()


def parse_roles(role_str: str | None) -> list[str]:
  if not role_str:
    return []
  return [r for r in (role_str.split(",") if "," in role_str else [role_str]) if r]


def serialize_roles(roles: list[str]) -> str:
  cleaned = [r for r in roles if r]
  return ",".join(cleaned) if cleaned else "lab_operator"


@app.get("/admin/users", response_model=list[UserOut])
async def list_users(db: Session = Depends(get_db)):
  rows = db.execute(select(UserModel)).scalars().all()
  return [
    UserOut(
      id=r.id,
      username=r.username,
      full_name=r.full_name,
      role=parse_roles(r.roles)[0] if parse_roles(r.roles) else r.role,
      roles=parse_roles(r.roles) or [r.role],
    )
    for r in rows
  ]


@app.patch("/admin/users/{user_id}", response_model=UserOut)
async def update_user_role(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)):
  row = db.get(UserModel, user_id)
  if not row:
    raise HTTPException(status_code=404, detail="User not found")
  roles = payload.roles or ([payload.role] if payload.role else parse_roles(row.roles) or [row.role])
  primary = roles[0] if roles else row.role
  row.role = primary
  row.roles = serialize_roles(roles)
  db.add(row)
  db.commit()
  db.refresh(row)
  return UserOut(id=row.id, username=row.username, full_name=row.full_name, role=row.role, roles=parse_roles(row.roles) or [row.role])
