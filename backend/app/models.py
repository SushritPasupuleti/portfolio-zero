from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SourceState = Literal[
    "connected",
    "disconnected",
    "partial",
    "stale",
    "invalid",
    "reauth_required",
]


class SourceStatus(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    source: str
    source_type: str
    state: SourceState = "disconnected"
    last_successful_refresh: datetime | None = None
    last_attempted_refresh: datetime | None = None
    last_error: str | None = None
    currency: str = "INR"
    as_of: datetime | None = None
    status_message: str | None = None


class Holding(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    instrument_name: str
    asset_class: str
    symbol: str | None = None
    quantity: float | None = None
    average_cost: float | None = None
    last_price: float | None = None
    value: float | None = None
    pnl: float | None = None
    currency: str = "INR"
    source: str = "manual-import"
    as_of: datetime | None = None


class Sip(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scheme_name: str
    amount: float | None = None
    frequency: str | None = None
    next_date: datetime | None = None
    status: str | None = None
    source: str = "manual-import"
    as_of: datetime | None = None


class AllocationBucket(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    asset_class: str
    value: float
    percentage: float


class PortfolioSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_value: float | None = None
    day_change: float | None = None
    invested: float | None = None
    pnl: float | None = None
    currency: str = "INR"
    as_of: datetime | None = None
    status: Literal["empty", "partial", "ready", "stale", "invalid"] = "empty"
    sources: list[SourceStatus] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ImportPreviewRequest(BaseModel):
    source_type: str = Field(default="manual-import")
    rows: list[dict] = Field(default_factory=list)


class ImportPreviewResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    source_type: str
    row_count: int
    valid_rows: int
    status: Literal["valid", "invalid", "partial"]
    warnings: list[str] = Field(default_factory=list)


class ImportCommitResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: Literal["success", "failed"]
    rows_committed: int
    warnings: list[str] = Field(default_factory=list)
