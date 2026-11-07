from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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
    price_as_of: datetime | None = None
    price_source: str | None = None
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


class Preferences(BaseModel):
    show_manual_imports: bool = True
    auto_sync_zerodha: bool = True
    theme: Literal["latte", "frappe", "macchiato", "mocha"] = "latte"
    ollama_enabled: bool = False
    ollama_endpoint: str = "http://127.0.0.1:11434"
    ollama_model: str = "gemma4:e2b"
    yfinance_sync_enabled: bool = False
    yahoo_terms_confirmed: bool = False
    auto_sync_yfinance: bool = False
    yahoo_news_enabled: bool = False
    rss_news_enabled: bool = False
    news_lookback_hours: int = Field(default=24, ge=1, le=720)
    news_max_articles: int = Field(default=30, ge=5, le=150)


class ManualPositionInput(BaseModel):
    id: str | None = None
    ticker: str = Field(min_length=1, max_length=80)
    units: float = Field(gt=0)
    market: Literal["BSE", "NSE", "NYSE"]
    buy_price: float = Field(ge=0)
    current_price: float | None = Field(default=None, ge=0)
    source: str = Field(min_length=1, max_length=120)
    asset_type: Literal["stock", "mf", "etf", "bond", "other"] = "stock"

    @field_validator("ticker", "source")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value


class ManualPositionBulkEdit(BaseModel):
    ids: list[str] = Field(min_length=1)
    market: Literal["BSE", "NSE", "NYSE"] | None = None
    source: str | None = Field(default=None, max_length=120)
    asset_type: Literal["stock", "mf", "etf", "bond", "other"] | None = None


class ManualPositionIds(BaseModel):
    ids: list[str] = Field(min_length=1)


class ManualPositionImport(BaseModel):
    csv_text: str = Field(max_length=5_000_000)
    replace_existing: bool = False
