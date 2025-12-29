from pydantic import BaseModel


class Sample(BaseModel):
    sample_id: str
    well_id: str
    horizon: str
    sampling_date: str
    status: str = "new"
    storage_location: str | None = None


class PlannedAnalysisCreate(BaseModel):
    sample_id: str
    analysis_type: str
    assigned_to: str | None = None


class PlannedAnalysisUpdate(BaseModel):
    status: str | None = None
    assigned_to: str | None = None


class PlannedAnalysisOut(BaseModel):
    id: int
    sample_id: str
    analysis_type: str
    status: str
    assigned_to: str | None = None


class ActionBatchCreate(BaseModel):
    title: str
    date: str
    status: str = "new"


class ActionBatchOut(BaseModel):
    id: int
    title: str
    date: str
    status: str


class ConflictCreate(BaseModel):
    old_payload: str
    new_payload: str
    status: str = "open"


class ConflictUpdate(BaseModel):
    status: str | None = None
    resolution_note: str | None = None


class ConflictOut(BaseModel):
    id: int
    old_payload: str
    new_payload: str
    status: str
    resolution_note: str | None = None


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str


class UserUpdate(BaseModel):
    role: str
