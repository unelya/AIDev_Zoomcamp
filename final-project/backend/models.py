from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
import enum

try:
    from .database import Base
except ImportError:  # pragma: no cover
    from database import Base  # type: ignore


class SampleStatus(enum.Enum):
    new = "new"
    progress = "progress"
    review = "review"
    done = "done"


class SampleModel(Base):
    __tablename__ = "samples"

    sample_id: Mapped[str] = mapped_column(String, primary_key=True)
    well_id: Mapped[str] = mapped_column(String, nullable=False)
    horizon: Mapped[str] = mapped_column(String, nullable=False)
    sampling_date: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[SampleStatus] = mapped_column(Enum(SampleStatus), default=SampleStatus.new, nullable=False)
    storage_location: Mapped[str | None] = mapped_column(String, nullable=True)


class AnalysisStatus(enum.Enum):
    planned = "planned"
    in_progress = "in_progress"
    review = "review"
    completed = "completed"
    failed = "failed"


class PlannedAnalysisModel(Base):
    __tablename__ = "planned_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sample_id: Mapped[str] = mapped_column(String, ForeignKey("samples.sample_id", ondelete="CASCADE"), nullable=False)
    analysis_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[AnalysisStatus] = mapped_column(Enum(AnalysisStatus), default=AnalysisStatus.planned, nullable=False)
    assigned_to: Mapped[str | None] = mapped_column(String, nullable=True)
