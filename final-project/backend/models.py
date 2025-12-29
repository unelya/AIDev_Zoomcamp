from sqlalchemy import Enum, String
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
