"""מודלי Pydantic שמשקפים את סכמות ה-Zod של הדשבורד (src/schema/index.ts): אותם שדות, אותם טווחים.

השדות נקראים כמו ב-JSON (camelCase). המודלים בודקים קלט של ה-API וקבצים שמורים; המנוע עצמו עובד על
dict-ים בצורת ה-JSON (model_dump(exclude_none=True)). tests/test_schema.py בודק שהשדות זהים לאלה של Zod.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SCHEMA_VERSION = "energy-dashboard/v1"

Year = Annotated[int, Field(ge=2000, le=2100)]
NonNeg = Annotated[float, Field(ge=0)]
Unit = Annotated[float, Field(ge=0, le=1)]
AxisScore = Annotated[float, Field(ge=0, le=10)]
DemandPreset = Literal["low", "medium", "high"]
SupplyPreset = Literal["reference", "declared", "tested"]
IsoDate = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]


class Model(BaseModel):
    """בסיס: שדות לא מוכרים נדחים (כמו strict ב-Zod? לא: Zod מתעלם מהם, ולכן גם כאן מתעלמים)."""

    model_config = ConfigDict(extra="ignore")


# ---------- ביקוש ----------
class NonElectric(Model):
    fuelsTWh: NonNeg
    gasTWh: NonNeg
    growthPct: float
    electrifyOffset: NonNeg | None = None


class SubSector(Model):
    key: Annotated[str, Field(min_length=1)]
    label: str
    elecShare: Unit
    fuelShare: Unit
    growthPct: float | None = None


class SectorDemand(Model):
    key: Annotated[str, Field(min_length=1)]
    label: str
    baseTWh: NonNeg
    growthPct: float
    curve: Literal["linear", "exp", "s"]
    sMidYear: int | None = None
    efficiencyPct: Annotated[float, Field(ge=0, le=100)]
    loadFactor: Annotated[float, Field(gt=0, le=1)]
    nonElectric: NonElectric | None = None
    subSectors: list[SubSector] | None = None


class Measures(Model):
    efficiencyPct: Annotated[float, Field(ge=0, le=40)]
    savingPct: Annotated[float, Field(ge=0, le=40)]


class DemandScenario(Model):
    id: str
    name: str
    preset: DemandPreset | None = None
    baseYear: int
    horizonYear: int
    sectors: list[SectorDemand]
    measures: Measures | None = None

    @model_validator(mode="after")
    def _years(self):
        if self.horizonYear <= self.baseYear:
            raise ValueError("שנת האופק חייבת להיות אחרי שנת הבסיס")
        return self


# ---------- היצע ----------
class Slope(Model):
    start: Year
    slopeGW: NonNeg


class Ramp(Model):
    start: Year
    rateGW: NonNeg
    rampYears: NonNeg


class Share(Model):
    start: Year
    sharePct: Annotated[float, Field(ge=0, le=100)]


class SolarRule(Model):
    baseGW: NonNeg
    slopeGW: NonNeg


class ImportRule(Model):
    start: Year
    stepGW: NonNeg
    stepYears: Annotated[int, Field(ge=1)]
    steps: Annotated[int, Field(ge=1)]


class ScenarioPlanParams(Model):
    solar: SolarRule
    solar30: Slope
    solar40: Slope
    importElectricity: ImportRule
    geothermal: Ramp
    fusion: Ramp
    cleanFuels: Share
    hydrogen: Share


class CapacityPoint(Model):
    year: int
    gw: NonNeg


class SupplySource(Model):
    key: Annotated[str, Field(min_length=1)]
    label: str
    enabled: bool
    renewable: bool
    capacityGW: Annotated[list[CapacityPoint], Field(min_length=1)]
    capacityFactor: Unit
    capacityCredit: Unit
    retireYear: int | None = None
    maxGW: NonNeg | None = None


class SupplyScenario(Model):
    id: str
    name: str
    preset: SupplyPreset | None = None
    demandPreset: DemandPreset | None = None
    demandScenarioRef: str | None = None
    sources: list[SupplySource]
    fillPriority: list[str]
    planParams: ScenarioPlanParams | None = None


# ---------- מעקב ----------
class Milestone(Model):
    name: str
    date: IsoDate
    done: bool


class Project(Model):
    id: Annotated[str, Field(min_length=1)]
    name: Annotated[str, Field(min_length=1)]
    channel: Annotated[str, Field(min_length=1)]
    owner: str
    mw: NonNeg | None = None
    plannedStart: IsoDate
    plannedEnd: IsoDate
    progressPct: Annotated[float, Field(ge=0, le=100)]
    status: Literal["on-track", "at-risk", "delayed"] | None = None
    milestones: list[Milestone]
    notes: str | None = None

    @model_validator(mode="after")
    def _dates(self):
        if self.plannedEnd < self.plannedStart:
            raise ValueError("תאריך הסיום חייב להיות אחרי תאריך ההתחלה")
        return self


class ProjectsData(Model):
    id: str
    name: str
    asOf: IsoDate
    projects: list[Project]


class TrilemmaScore(Model):
    security: AxisScore
    affordability: AxisScore
    sustainability: AxisScore
    feasibilityPct: Annotated[float, Field(ge=0, le=100)]


# ---------- קבצים שמורים ----------
class DemandFile(Model):
    schema_: Literal["energy-dashboard/v1"] = Field(alias="schema")
    kind: Literal["demand"]
    savedAt: str
    data: DemandScenario


class SupplyFile(Model):
    schema_: Literal["energy-dashboard/v1"] = Field(alias="schema")
    kind: Literal["supply"]
    savedAt: str
    data: SupplyScenario


class ProjectsFile(Model):
    schema_: Literal["energy-dashboard/v1"] = Field(alias="schema")
    kind: Literal["projects"]
    savedAt: str
    data: ProjectsData


def dump(m: BaseModel) -> dict:
    """המודל כ-dict בצורת ה-JSON (בלי שדות ריקים), לשימוש במנוע."""
    return m.model_dump(exclude_none=True, by_alias=True)
