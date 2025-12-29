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


class ActionBatchStatus(enum.Enum):
    new = "new"
    review = "review"
    done = "done"


class ActionBatchModel(Base):
    __tablename__ = "action_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    date: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[ActionBatchStatus] = mapped_column(Enum(ActionBatchStatus), default=ActionBatchStatus.new, nullable=False)


class ConflictStatus(enum.Enum):
    open = "open"
    resolved = "resolved"


class ConflictModel(Base):
    __tablename__ = "conflicts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    old_payload: Mapped[str] = mapped_column(String, nullable=False)
    new_payload: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[ConflictStatus] = mapped_column(Enum(ConflictStatus), default=ConflictStatus.open, nullable=False)
    resolution_note: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String, nullable=True)
    updated_at: Mapped[str | None] = mapped_column(String, nullable=True)


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False, default="lab_operator")


class AuditLogModel(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    performed_by: Mapped[str | None] = mapped_column(String, nullable=True)
    performed_at: Mapped[str] = mapped_column(String, nullable=False)
    details: Mapped[str | None] = mapped_column(String, nullable=True)
