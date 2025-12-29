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
