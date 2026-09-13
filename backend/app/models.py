# Copyright (c) 2026 tro. Contributors
# SPDX-License-Identifier: MIT
"""Database entities and dynamic pricing models for tro. backend."""

from datetime import datetime, timezone
import json
import secrets
from typing import Any, Dict, List, Optional
import uuid

# Ensure compatibility shim is active if sqlmodel is not installed
from .compat import SQLModel, Field


def get_default_tiers() -> List[Dict[str, Any]]:
    """Return default 6-tier progressive electricity tariff per QĐ 1279/QĐ-BCT."""
    return [
        {"tier_number": 1, "max_threshold": 50.0, "unit_price": 1984.0},
        {"tier_number": 2, "max_threshold": 50.0, "unit_price": 2050.0},
        {"tier_number": 3, "max_threshold": 100.0, "unit_price": 2380.0},
        {"tier_number": 4, "max_threshold": 100.0, "unit_price": 2998.0},
        {"tier_number": 5, "max_threshold": 100.0, "unit_price": 3350.0},
        {"tier_number": 6, "max_threshold": None, "unit_price": 3460.0},
    ]


DEFAULT_TIERS_JSON: str = json.dumps(get_default_tiers(), ensure_ascii=False)


def generate_invite_code(length: int = 8) -> str:
    """Generate a random alphanumeric invite code of 6-8 characters."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


class User(SQLModel, table=True):
    """User account entity (landlords and tenants)."""
    __tablename__ = "user"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    hashed_password: str
    full_name: Optional[str] = Field(default=None)
    phone: Optional[str] = Field(default=None)
    role: str = Field(default="tenant")  # "tenant" | "landlord" | "admin" | "root_admin" | "pending_admin"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def is_landlord(self) -> bool:
        return self.role == "landlord"

    @property
    def is_tenant(self) -> bool:
        return self.role == "tenant"

    @property
    def is_admin(self) -> bool:
        return self.role in ("admin", "root_admin")

    @property
    def is_root_admin(self) -> bool:
        return self.role == "root_admin"

    @property
    def is_pending_admin(self) -> bool:
        return self.role == "pending_admin"


class Property(SQLModel, table=True):
    """Rental property entity (Khu trọ) managed by a landlord."""
    __tablename__ = "property"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    address: Optional[str] = Field(default=None)
    landlord_id: Optional[int] = Field(default=None, foreign_key="user.id")
    tariff_type: Optional[str] = Field(default="statutory")  # "statutory" or "custom"
    custom_elec_rate: Optional[float] = Field(default=None)
    custom_water_rate: Optional[float] = Field(default=None)
    custom_water_type: Optional[str] = Field(default="PER_M3")

    def __init__(self, **data: Any):
        if not data.get("tariff_type"):
            data["tariff_type"] = "statutory"
        if not data.get("custom_water_type"):
            data["custom_water_type"] = "PER_M3"
        super().__init__(**data)


class Room(SQLModel, table=True):
    """Rental room entity (Phòng trọ) within a property."""
    __tablename__ = "room"

    id: Optional[int] = Field(default=None, primary_key=True)
    room_number: str
    property_id: Optional[int] = Field(default=None, foreign_key="property.id")
    invite_code: str = Field(default_factory=lambda: generate_invite_code(8), unique=True, index=True)
    status: str = Field(default="empty")  # "active", "empty"
    current_people_count: int = Field(default=1)
    tenant_id: Optional[int] = Field(default=None, foreign_key="user.id")

    def __init__(self, **data: Any):
        if not data.get("invite_code"):
            data["invite_code"] = generate_invite_code(8)
        super().__init__(**data)

    def assign_tenant(self, tenant_id: int) -> None:
        """Assign a tenant to the room and set status to active."""
        self.tenant_id = tenant_id
        self.status = "active"

    def remove_tenant(self) -> None:
        """Remove tenant from room, set status to empty, and generate a new invite code."""
        self.tenant_id = None
        self.status = "empty"
        self.invite_code = generate_invite_code(8)


class SystemConfig(SQLModel, table=True):
    """Dynamic pricing configuration for electricity and water tariffs.

    Enables dynamic configuration without hardcoding values in source code:
    - electricity_vat_rate (default 0.08 per Nghị quyết 204/2025/QH15)
    - electricity_tier3_price (default 2380.0 per Thông tư 60/2025/TT-BCT)
    - tiers_json (6 progressive tiers per Quyết định 1279/QĐ-BCT)
    - water_pricing_type ("PER_M3" or "PER_PERSON")
    - water_unit_price (default 8500.0 đ/m³)
    - water_vat_rate (default 0.05)
    - water_env_fee_rate (default 0.10)
    """
    __tablename__ = "systemconfig"

    id: Optional[int] = Field(default=1, primary_key=True)
    electricity_vat_rate: float = Field(default=0.08)
    electricity_tier3_price: float = Field(default=2380.0)
    tiers_json: str = Field(default=DEFAULT_TIERS_JSON)
    water_pricing_type: str = Field(default="PER_M3")  # "PER_M3" or "PER_PERSON"
    water_unit_price: float = Field(default=8500.0)
    water_vat_rate: float = Field(default=0.05)
    water_env_fee_rate: float = Field(default=0.10)
    tariff_version: str = Field(default="QD-1279-2023")
    tariff_updated_at: Optional[datetime] = Field(default=None)
    fallback_tier_number: int = Field(default=3)
    fallback_flat_price: Optional[float] = Field(default=None)
    legal_basis_elec: str = Field(default="QĐ 1279/QĐ-BCT & TT 60/2025/TT-BCT")
    legal_basis_vat: str = Field(default="Nghị quyết 204/2025/QH15")
    compliance_decree: str = Field(default="Nghị định 104/2022/NĐ-CP & NĐ 17/2022/NĐ-CP")
    penalty_text: str = Field(default="20.000.000 đ đến 30.000.000 đ")
    tier3_rule_note: str = Field(default="Khoản 4 Điều 10 Thông tư 60/2025/TT-BCT")

    def get_tiers(self) -> List[Dict[str, Any]]:
        """Parse and return tiers as a Python list of dictionaries."""
        if not self.tiers_json:
            return get_default_tiers()
        try:
            return json.loads(self.tiers_json)
        except (ValueError, TypeError):
            return get_default_tiers()

    def set_tiers(self, tiers: List[Dict[str, Any]]) -> None:
        """Serialize and store tiers list into tiers_json field."""
        if not isinstance(tiers, list):
            raise TypeError("Tiers must be a list of tier dictionary objects.")
        if not tiers:
            raise ValueError("Tiers list cannot be empty.")
        for idx, t in enumerate(tiers):
            if not isinstance(t, dict):
                raise TypeError(f"Tier at index {idx} must be a dictionary.")
            if "tier_number" not in t or "unit_price" not in t:
                raise ValueError(f"Tier at index {idx} must have 'tier_number' and 'unit_price'.")
            int(t["tier_number"])
            float(t["unit_price"])
            if t.get("max_threshold") is not None:
                float(t["max_threshold"])
        self.tiers_json = json.dumps(tiers, ensure_ascii=False)

    @property
    def tiers(self) -> List[Dict[str, Any]]:
        """Property alias for parsed tiers list."""
        return self.get_tiers()

    def to_electricity_config(self) -> Any:
        """Bridge database configuration to core.models.ElectricityConfig for calculation."""
        from decimal import Decimal
        from core.models import ElectricityConfig, TariffTier
        tiers_data = self.get_tiers()
        tiers = [
            TariffTier(
                tier_number=int(t["tier_number"]),
                max_threshold=Decimal(str(t["max_threshold"])) if t.get("max_threshold") is not None else None,
                unit_price=Decimal(str(t["unit_price"])),
            )
            for t in tiers_data
        ]
        # Calculate dynamic fallback price when quota is absent
        if self.fallback_flat_price is not None:
            effective_fallback_price = Decimal(str(self.fallback_flat_price))
        else:
            fb_num = int(self.fallback_tier_number or 3)
            matching_tier = next((t for t in tiers if t.tier_number == fb_num), None)
            if matching_tier:
                effective_fallback_price = matching_tier.unit_price
            else:
                effective_fallback_price = Decimal(str(self.electricity_tier3_price))

        return ElectricityConfig(
            tiers=tiers,
            vat_rate=Decimal(str(self.electricity_vat_rate)),
            tier3_price=effective_fallback_price,
        )

    def to_water_config(self) -> Any:
        """Bridge database configuration to core.models.WaterConfig for calculation."""
        from decimal import Decimal
        from core.models import WaterConfig, WaterPricingType
        return WaterConfig(
            pricing_type=WaterPricingType(self.water_pricing_type),
            unit_price=Decimal(str(self.water_unit_price)),
            vat_rate=Decimal(str(self.water_vat_rate)),
            env_fee_rate=Decimal(str(self.water_env_fee_rate)),
        )

    @classmethod
    def from_configs(
        cls,
        elec_cfg: Any,
        water_cfg: Any,
        id: int = 1,
        tariff_version: str = "QD-1279-2023",
        tariff_updated_at: Optional[datetime] = None,
    ) -> "SystemConfig":
        """Factory creating SystemConfig from core ElectricityConfig and WaterConfig."""
        tiers_list = [
            {
                "tier_number": t.tier_number,
                "max_threshold": float(t.max_threshold) if t.max_threshold is not None else None,
                "unit_price": float(t.unit_price),
            }
            for t in elec_cfg.tiers
        ]
        return cls(
            id=id,
            electricity_vat_rate=float(elec_cfg.vat_rate),
            electricity_tier3_price=float(elec_cfg.tier3_price),
            tiers_json=json.dumps(tiers_list, ensure_ascii=False),
            water_pricing_type=water_cfg.pricing_type.value if hasattr(water_cfg.pricing_type, "value") else str(water_cfg.pricing_type),
            water_unit_price=float(water_cfg.unit_price),
            water_vat_rate=float(water_cfg.vat_rate),
            water_env_fee_rate=float(water_cfg.env_fee_rate),
            tariff_version=tariff_version,
            tariff_updated_at=tariff_updated_at,
        )


class MeterReading(SQLModel, table=True):
    """Monthly meter reading entity for a specific room."""
    __tablename__ = "meterreading"

    id: Optional[int] = Field(default=None, primary_key=True)
    room_id: int = Field(foreign_key="room.id")
    month_year: str = Field(index=True)  # Format YYYY-MM
    elec_start: float = Field(default=0.0)
    elec_end: float = Field(default=0.0)
    water_start: float = Field(default=0.0)
    water_end: float = Field(default=0.0)
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def generate_short_invoice_code(length: int = 4) -> str:
    """Generate a short, memorable invoice code like HD-89B2 or HD-7K2M."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    suffix = "".join(secrets.choice(alphabet) for _ in range(length))
    return f"HD-{suffix}"


class Invoice(SQLModel, table=True):
    """Monthly room invoice entity with statutory calculation and dispute comparison."""
    __tablename__ = "invoice"

    id: Optional[int] = Field(default=None, primary_key=True)
    room_id: int = Field(foreign_key="room.id")
    month_year: str = Field(index=True)  # Format YYYY-MM
    elec_kwh: float = Field(default=0.0)
    elec_amount: float = Field(default=0.0)
    water_usage: float = Field(default=0.0)
    water_amount: float = Field(default=0.0)
    total_statutory_amount: float = Field(default=0.0)
    actual_collected_amount: float = Field(default=0.0)
    diff_amount: float = Field(default=0.0)
    share_token: str = Field(default_factory=lambda: str(uuid.uuid4()), unique=True, index=True)
    short_code: str = Field(default_factory=lambda: generate_short_invoice_code(4), unique=True, index=True)
    status: str = Field(default="draft")  # "draft" or "published"
    published_at: Optional[datetime] = Field(default=None)
    breakdown_json: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def __init__(self, **data: Any):
        if not data.get("short_code"):
            data["short_code"] = generate_short_invoice_code(4)
        if not data.get("status"):
            data["status"] = "draft"
        super().__init__(**data)

    def get_breakdown(self) -> Optional[Dict[str, Any]]:
        """Parse breakdown_json into Python dictionary."""
        if not self.breakdown_json:
            return None
        try:
            return json.loads(self.breakdown_json)
        except (ValueError, TypeError):
            return None

    def set_breakdown(self, breakdown: Dict[str, Any]) -> None:
        """Serialize dictionary into breakdown_json field."""
        self.breakdown_json = json.dumps(breakdown, ensure_ascii=False)

    @property
    def breakdown(self) -> Optional[Dict[str, Any]]:
        """Property alias for parsed breakdown dictionary."""
        return self.get_breakdown()

    @property
    def room_number(self) -> Optional[str]:
        """Convenience property extracting room_number from breakdown if available."""
        b = self.get_breakdown()
        if b and isinstance(b, dict):
            return b.get("room_number")
        return None

    @property
    def property_name(self) -> Optional[str]:
        """Convenience property extracting property_name from breakdown if available."""
        b = self.get_breakdown()
        if b and isinstance(b, dict):
            return b.get("property_name")
        return None


class AdminSecretKey(SQLModel, table=True):
    """Secret registration keys allowing promotion to admin hierarchy."""
    __tablename__ = "adminsecretkey"

    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_secret: str
    encrypted_secret: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by_id: Optional[int] = Field(default=None)
    is_active: bool = Field(default=True)
    deactivated_at: Optional[datetime] = Field(default=None)


class AdminApprovalRequest(SQLModel, table=True):
    """Audit requests created when new admins register while existing admins exist."""
    __tablename__ = "adminapprovalrequest"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    secret_key_id: int = Field(foreign_key="adminsecretkey.id")
    requested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = Field(default="pending")
    reviewed_by_id: Optional[int] = Field(default=None)
    reviewed_at: Optional[datetime] = Field(default=None)
    reject_reason: Optional[str] = Field(default=None)


class TariffChangeLog(SQLModel, table=True):
    """Auditable log of dynamic electricity and water tariff updates."""
    __tablename__ = "tariffchangelog"

    id: Optional[int] = Field(default=None, primary_key=True)
    changed_by_id: int = Field(foreign_key="user.id")
    changed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    tariff_version: str
    snapshot_json: str
    note: Optional[str] = Field(default=None)


class OccupancyChangeRequest(SQLModel, table=True):
    """Dual-approval occupancy change request initiated by tenant or landlord."""
    __tablename__ = "occupancychangerequest"

    id: Optional[int] = Field(default=None, primary_key=True)
    room_id: int = Field(foreign_key="room.id")
    requested_by_role: str = Field(default="tenant")  # "tenant" | "landlord"
    requested_by_id: int = Field(foreign_key="user.id")
    old_people_count: int = Field(default=1)
    new_people_count: int = Field(default=1)
    effective_date: str  # YYYY-MM-DD
    note: Optional[str] = Field(default=None)
    status: str = Field(default="pending")  # "pending" | "approved" | "rejected"
    reviewed_by_id: Optional[int] = Field(default=None)
    reviewed_at: Optional[datetime] = Field(default=None)
    reject_reason: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RoomOccupancyLog(SQLModel, table=True):
    """Historical record of approved occupant changes for prorated quota calculations."""
    __tablename__ = "roomoccupancylog"

    id: Optional[int] = Field(default=None, primary_key=True)
    room_id: int = Field(foreign_key="room.id")
    old_count: int = Field(default=1)
    new_count: int = Field(default=1)
    effective_date: str  # YYYY-MM-DD
    approved_by_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
