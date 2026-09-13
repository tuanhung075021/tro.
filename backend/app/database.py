# Copyright (c) 2026 tro. Contributors
# SPDX-License-Identifier: MIT
"""Database engine, session management, and initialization for tro. backend."""

import base64
import hashlib
import os
from typing import Any, Generator, Optional
from .compat import SQLModel, Session, create_engine, select
from .models import (
    DEFAULT_TIERS_JSON,
    AdminApprovalRequest,
    AdminSecretKey,
    Invoice,
    MeterReading,
    Property,
    Room,
    SystemConfig,
    TariffChangeLog,
    User,
    OccupancyChangeRequest,
    RoomOccupancyLog,
)


def hash_admin_secret(secret: str) -> str:
    """Hash admin secret key using PBKDF2-HMAC-SHA256 with static system salt."""
    return hashlib.pbkdf2_hmac(
        'sha256', secret.encode(), b'tro_admin_salt_2026', 100_000
    ).hex()


def encrypt_admin_secret(raw_secret: str) -> str:
    """Reversibly encrypt active secret key so authenticated Root Admin can view it."""
    try:
        from cryptography.fernet import Fernet
        k = base64.urlsafe_b64encode(hashlib.sha256(b"tro_secret_salt_2026").digest())
        return Fernet(k).encrypt(raw_secret.encode("utf-8")).decode("utf-8")
    except Exception:
        # Resilient symmetric XOR fallback
        key = hashlib.sha256(b"tro_secret_salt_2026").digest()
        raw_bytes = raw_secret.encode("utf-8")
        xored = bytes(b ^ key[i % len(key)] for i, b in enumerate(raw_bytes))
        return "xor:" + base64.b64encode(xored).decode("ascii")


def decrypt_admin_secret(enc_secret: str) -> str:
    """Decrypt encrypted secret key for verified Root Admin."""
    if not enc_secret:
        return ""
    if enc_secret.startswith("xor:"):
        key = hashlib.sha256(b"tro_secret_salt_2026").digest()
        xored = base64.b64decode(enc_secret[4:])
        return bytes(b ^ key[i % len(key)] for i, b in enumerate(xored)).decode("utf-8")
    try:
        from cryptography.fernet import Fernet
        k = base64.urlsafe_b64encode(hashlib.sha256(b"tro_secret_salt_2026").digest())
        return Fernet(k).decrypt(enc_secret.encode("utf-8")).decode("utf-8")
    except Exception:
        return ""

# Database file configuration
DEFAULT_DB_FILE = "tro.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_FILE}")

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)


def get_session(custom_engine: Optional[Any] = None) -> Generator[Session, None, None]:
    """Dependency injection generator producing a database session for FastAPI."""
    target_engine = custom_engine or engine
    with Session(target_engine) as session:
        yield session


def init_db(target_engine: Optional[Any] = None) -> None:
    """Initialize database tables and seed default pricing configuration if empty."""
    db_engine = target_engine or engine
    SQLModel.metadata.create_all(db_engine)

    with Session(db_engine) as session:
        # Self-healing migration for existing databases: fill default values for columns that are NULL
        try:
            raw_conn = getattr(session, "conn", None)
            if raw_conn:
                raw_conn.execute("UPDATE property SET tariff_type = 'statutory' WHERE tariff_type IS NULL")
                raw_conn.execute("UPDATE property SET custom_water_type = 'PER_M3' WHERE custom_water_type IS NULL")
                raw_conn.execute("UPDATE room SET status = 'empty' WHERE status IS NULL")
                raw_conn.execute("UPDATE room SET current_people_count = 1 WHERE current_people_count IS NULL")
                try:
                    raw_conn.execute("ALTER TABLE systemconfig ADD COLUMN tariff_version TEXT DEFAULT 'QD-1279-2023'")
                except Exception:
                    pass
                try:
                    raw_conn.execute("ALTER TABLE systemconfig ADD COLUMN tariff_updated_at TEXT")
                except Exception:
                    pass
                try:
                    raw_conn.execute("ALTER TABLE adminsecretkey ADD COLUMN encrypted_secret TEXT")
                except Exception:
                    pass
                try:
                    raw_conn.execute("ALTER TABLE systemconfig ADD COLUMN fallback_tier_number INTEGER DEFAULT 3")
                except Exception:
                    pass
                try:
                    raw_conn.execute("ALTER TABLE systemconfig ADD COLUMN fallback_flat_price REAL")
                except Exception:
                    pass
                try:
                    raw_conn.execute("ALTER TABLE systemconfig ADD COLUMN legal_basis_elec TEXT DEFAULT 'QĐ 1279/QĐ-BCT & TT 60/2025/TT-BCT'")
                except Exception:
                    pass
                try:
                    raw_conn.execute("ALTER TABLE systemconfig ADD COLUMN legal_basis_vat TEXT DEFAULT 'Nghị quyết 204/2025/QH15'")
                except Exception:
                    pass
                try:
                    raw_conn.execute("ALTER TABLE systemconfig ADD COLUMN compliance_decree TEXT DEFAULT 'Nghị định 104/2022/NĐ-CP & NĐ 17/2022/NĐ-CP'")
                except Exception:
                    pass
                try:
                    raw_conn.execute("ALTER TABLE systemconfig ADD COLUMN penalty_text TEXT DEFAULT '20.000.000 đ đến 30.000.000 đ'")
                except Exception:
                    pass
                try:
                    raw_conn.execute("ALTER TABLE systemconfig ADD COLUMN tier3_rule_note TEXT DEFAULT 'Khoản 4 Điều 10 Thông tư 60/2025/TT-BCT'")
                except Exception:
                    pass
                raw_conn.execute("UPDATE systemconfig SET tariff_version = 'QD-1279-2023' WHERE tariff_version IS NULL")
                raw_conn.commit()
        except Exception:
            pass

        config = session.get(SystemConfig, 1)
        if config is None:
            statement = select(SystemConfig)
            existing = session.exec(statement).first()
            if existing is None:
                default_config = SystemConfig(
                    id=1,
                    electricity_vat_rate=0.08,
                    electricity_tier3_price=2380.0,
                    tiers_json=DEFAULT_TIERS_JSON,
                    water_pricing_type="PER_M3",
                    water_unit_price=8500.0,
                    water_vat_rate=0.05,
                    water_env_fee_rate=0.10,
                    tariff_version="QD-1279-2023",
                    tariff_updated_at=None,
                )
                session.add(default_config)
                session.commit()

        # Seed default AdminSecretKey if no active key exists
        active_key = session.exec(
            select(AdminSecretKey).where(AdminSecretKey.is_active == True)
        ).first()
        if active_key is None:
            seed_key = AdminSecretKey(
                hashed_secret=hash_admin_secret("OHTLP_TRO.2026"),
                encrypted_secret=encrypt_admin_secret("OHTLP_TRO.2026"),
                is_active=True,
            )
            session.add(seed_key)
            session.commit()

