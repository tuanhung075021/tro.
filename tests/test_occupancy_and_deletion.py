# Copyright (c) 2026 tro. Contributors
# SPDX-License-Identifier: MIT
"""Comprehensive unit and integration tests for Room/Property deletion safety and Dual-Approval Occupancy Change."""

from datetime import datetime, timezone
from decimal import Decimal
import os
import tempfile
import unittest
from typing import Dict, Tuple

from backend.app.auth import register, reset_rate_limits
from backend.app.compat import Session, TestClient, create_engine, select
from backend.app.database import init_db
from backend.app.main import app
from backend.app.models import (
    Invoice,
    MeterReading,
    OccupancyChangeRequest,
    Property,
    Room,
    RoomOccupancyLog,
    SystemConfig,
    User,
)
from backend.app.schemas import (
    DeleteEntityIn,
    InvoiceCalculateRequest,
    OccupancyChangeRequestIn,
    OccupancyChangeReviewIn,
    PropertyCreate,
    RoomCreate,
    UserRegister,
)
from backend.app.security import create_access_token


class TestOccupancyAndDeletion(unittest.TestCase):
    """Integration test suite covering deletion safety and occupancy change workflows."""

    def setUp(self) -> None:
        """Create an isolated temporary SQLite database for each test case."""
        reset_rate_limits()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_occ_del.db")
        self.engine = create_engine(
            f"sqlite:///{self.db_path}",
            echo=False,
            connect_args={"check_same_thread": False},
        )
        init_db(self.engine)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        """Clean up temporary test artifacts."""
        reset_rate_limits()
        self.temp_dir.cleanup()

    def _create_user(
        self,
        session: Session,
        username: str,
        role: str = "landlord",
        password: str = "SecurePass123!",
    ) -> Tuple[User, str]:
        """Helper to create and authenticate a user, returning the entity and JWT token."""
        user_reg = UserRegister(
            username=username,
            password=password,
            full_name=f"Full {username}",
            phone="0901234567",
            role=role,
        )
        registered = register(user_reg, session=session)
        token = create_access_token(
            {"sub": registered.username, "user_id": registered.id, "role": registered.role}
        )
        return session.get(User, registered.id), token

    def _auth_headers(self, token: str) -> Dict[str, str]:
        """Helper to generate standard Bearer authorization headers."""
        return {"Authorization": f"Bearer {token}"}

    # ========================================================================
    # 1. Room Deletion Safety
    # ========================================================================

    def test_delete_occupied_room_blocked(self) -> None:
        """Attempting to delete an occupied room must be blocked with HTTP 400."""
        with Session(self.engine) as session:
            landlord, l_token = self._create_user(session, "landlord_del1", role="landlord", password="LandlordPass123!")
            tenant, t_token = self._create_user(session, "tenant_del1", role="tenant")

            # Create property and room
            prop = Property(name="Khu A", address="123 Duong A", landlord_id=landlord.id)
            session.add(prop)
            session.commit()
            session.refresh(prop)

            room = Room(room_number="101", property_id=prop.id, invite_code="INV101", status="active", tenant_id=tenant.id)
            session.add(room)
            session.commit()
            session.refresh(room)

            # Try deleting room while occupied
            resp = self.client.request(
                "DELETE",
                f"/api/v1/rooms/{room.id}",
                json={"password": "LandlordPass123!"},
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertEqual(resp.status_code, 400)
            self.assertIn("đang có khách thuê", resp.json()["detail"])

            # Verify room still exists
            db_room = session.get(Room, room.id)
            self.assertIsNotNone(db_room)

    def test_delete_vacant_room_wrong_password_blocked(self) -> None:
        """Attempting to delete a vacant room with incorrect password must fail with HTTP 400."""
        with Session(self.engine) as session:
            landlord, l_token = self._create_user(session, "landlord_del2", role="landlord", password="LandlordPass123!")

            prop = Property(name="Khu B", landlord_id=landlord.id)
            session.add(prop)
            session.commit()
            session.refresh(prop)

            room = Room(room_number="102", property_id=prop.id, invite_code="INV102", status="vacant", tenant_id=None)
            session.add(room)
            session.commit()
            session.refresh(room)

            # Incorrect password
            resp = self.client.request(
                "DELETE",
                f"/api/v1/rooms/{room.id}",
                json={"password": "WrongPassword999!"},
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertEqual(resp.status_code, 400)
            self.assertIn("Mật khẩu xác thực không chính xác", resp.json()["detail"])

            # Verify room still exists
            db_room = session.get(Room, room.id)
            self.assertIsNotNone(db_room)

    def test_delete_vacant_room_success(self) -> None:
        """Deleting a vacant room with correct password succeeds and cleans up related records."""
        with Session(self.engine) as session:
            landlord, l_token = self._create_user(session, "landlord_del3", role="landlord", password="LandlordPass123!")

            prop = Property(name="Khu C", landlord_id=landlord.id)
            session.add(prop)
            session.commit()
            session.refresh(prop)

            room = Room(room_number="103", property_id=prop.id, invite_code="INV103", status="vacant", tenant_id=None)
            session.add(room)
            session.commit()
            session.refresh(room)

            # Add meter reading and request
            reading = MeterReading(room_id=room.id, month_year="2026-08", elec_start=10, elec_end=20)
            session.add(reading)
            session.commit()

            # Successful deletion
            resp = self.client.request(
                "DELETE",
                f"/api/v1/rooms/{room.id}",
                json={"password": "LandlordPass123!"},
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertEqual(resp.status_code, 200)
            self.assertIn("thành công", resp.json()["message"])

            # Verify room and related reading are gone
            db_room = session.get(Room, room.id)
            self.assertIsNone(db_room)
            db_reading = session.exec(select(MeterReading).where(MeterReading.room_id == room.id)).first()
            self.assertIsNone(db_reading)

    # ========================================================================
    # 2. Property Deletion Safety
    # ========================================================================

    def test_delete_property_with_occupied_room_blocked(self) -> None:
        """Deleting a property that still has occupied rooms must be blocked."""
        with Session(self.engine) as session:
            landlord, l_token = self._create_user(session, "landlord_prop1", role="landlord", password="LandlordPass123!")
            tenant, t_token = self._create_user(session, "tenant_prop1", role="tenant")

            prop = Property(name="Khu D", landlord_id=landlord.id)
            session.add(prop)
            session.commit()
            session.refresh(prop)

            room = Room(room_number="201", property_id=prop.id, invite_code="INV201", status="active", tenant_id=tenant.id)
            session.add(room)
            session.commit()

            resp = self.client.request(
                "DELETE",
                f"/api/v1/properties/{prop.id}",
                json={"password": "LandlordPass123!"},
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertEqual(resp.status_code, 400)
            self.assertIn("còn phòng đang có khách thuê", resp.json()["detail"])

    def test_delete_property_vacant_success(self) -> None:
        """Deleting an empty property succeeds and removes all child rooms and records."""
        with Session(self.engine) as session:
            landlord, l_token = self._create_user(session, "landlord_prop2", role="landlord", password="LandlordPass123!")

            prop = Property(name="Khu E", landlord_id=landlord.id)
            session.add(prop)
            session.commit()
            session.refresh(prop)

            room1 = Room(room_number="301", property_id=prop.id, invite_code="INV301", status="vacant")
            room2 = Room(room_number="302", property_id=prop.id, invite_code="INV302", status="vacant")
            session.add(room1)
            session.add(room2)
            session.commit()

            resp = self.client.request(
                "DELETE",
                f"/api/v1/properties/{prop.id}",
                json={"password": "LandlordPass123!"},
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertEqual(resp.status_code, 200)
            self.assertIn("thành công", resp.json()["message"])

            # Verify property and rooms are deleted
            self.assertIsNone(session.get(Property, prop.id))
            self.assertIsNone(session.get(Room, room1.id))
            self.assertIsNone(session.get(Room, room2.id))

    # ========================================================================
    # 3. Dual-Approval Occupancy Change
    # ========================================================================

    def test_tenant_creates_occupancy_request_and_landlord_approves(self) -> None:
        """Tenant requests occupancy change with password, Landlord approves."""
        with Session(self.engine) as session:
            landlord, l_token = self._create_user(session, "landlord_occ1", role="landlord", password="LPassWord123!")
            tenant, t_token = self._create_user(session, "tenant_occ1", role="tenant", password="TPassWord123!")

            prop = Property(name="Khu F", landlord_id=landlord.id)
            session.add(prop)
            session.commit()
            session.refresh(prop)

            room = Room(room_number="401", property_id=prop.id, invite_code="INV401", status="active", tenant_id=tenant.id, current_people_count=1)
            session.add(room)
            session.commit()
            session.refresh(room)

            # 1. Tenant wrong password fails
            fail_resp = self.client.post(
                f"/api/v1/rooms/{room.id}/occupancy-requests",
                json={
                    "new_people_count": 2,
                    "effective_date": "2026-09-15",
                    "note": "Bạn cùng phòng chuyển vào",
                    "password": "WrongPassword!",
                },
                headers=self._auth_headers(t_token),
                session=session,
            )
            self.assertEqual(fail_resp.status_code, 400)
            self.assertIn("Mật khẩu xác thực không chính xác", fail_resp.json()["detail"])

            # 2. Tenant correct password succeeds
            create_resp = self.client.post(
                f"/api/v1/rooms/{room.id}/occupancy-requests",
                json={
                    "new_people_count": 2,
                    "effective_date": "2026-09-15",
                    "note": "Bạn cùng phòng chuyển vào",
                    "password": "TPassWord123!",
                },
                headers=self._auth_headers(t_token),
                session=session,
            )
            self.assertEqual(create_resp.status_code, 201)
            req_data = create_resp.json()
            self.assertEqual(req_data["status"], "pending")
            self.assertEqual(req_data["requested_by_role"], "tenant")
            self.assertEqual(req_data["new_people_count"], 2)
            req_id = req_data["id"]

            # 3. Tenant CANNOT approve own request
            self_app_resp = self.client.post(
                f"/api/v1/occupancy-requests/{req_id}/approve",
                headers=self._auth_headers(t_token),
                session=session,
            )
            self.assertEqual(self_app_resp.status_code, 403)

            # 4. Landlord approves request
            app_resp = self.client.post(
                f"/api/v1/occupancy-requests/{req_id}/approve",
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertEqual(app_resp.status_code, 200)
            self.assertEqual(app_resp.json()["status"], "approved")

            # 5. Room people count updated and log created
            session.refresh(room)
            self.assertEqual(room.current_people_count, 2)

            logs = session.exec(select(RoomOccupancyLog).where(RoomOccupancyLog.room_id == room.id)).all()
            self.assertEqual(len(logs), 1)
            self.assertEqual(logs[0].old_count, 1)
            self.assertEqual(logs[0].new_count, 2)
            self.assertEqual(logs[0].effective_date, "2026-09-15")

    def test_landlord_creates_occupancy_request_and_tenant_approves(self) -> None:
        """Landlord requests occupancy change with password, Tenant approves."""
        with Session(self.engine) as session:
            landlord, l_token = self._create_user(session, "landlord_occ2", role="landlord", password="LPassWord456!")
            tenant, t_token = self._create_user(session, "tenant_occ2", role="tenant", password="TPassWord456!")

            prop = Property(name="Khu G", landlord_id=landlord.id)
            session.add(prop)
            session.commit()
            session.refresh(prop)

            room = Room(room_number="501", property_id=prop.id, invite_code="INV501", status="active", tenant_id=tenant.id, current_people_count=1)
            session.add(room)
            session.commit()
            session.refresh(room)

            # Landlord creates request
            create_resp = self.client.post(
                f"/api/v1/rooms/{room.id}/occupancy-requests",
                json={
                    "new_people_count": 3,
                    "effective_date": "2026-09-10",
                    "note": "Cập nhật theo thông báo chủ nhà",
                    "password": "LPassWord456!",
                },
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertEqual(create_resp.status_code, 201)
            req_id = create_resp.json()["id"]

            # Landlord CANNOT approve own request
            self_app_resp = self.client.post(
                f"/api/v1/occupancy-requests/{req_id}/approve",
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertEqual(self_app_resp.status_code, 403)

            # Tenant approves
            app_resp = self.client.post(
                f"/api/v1/occupancy-requests/{req_id}/approve",
                headers=self._auth_headers(t_token),
                session=session,
            )
            self.assertEqual(app_resp.status_code, 200)
            self.assertEqual(app_resp.json()["status"], "approved")

            session.refresh(room)
            self.assertEqual(room.current_people_count, 3)

    def test_occupancy_request_rejection(self) -> None:
        """Counterparty can reject an occupancy change request with reason."""
        with Session(self.engine) as session:
            landlord, l_token = self._create_user(session, "landlord_occ3", role="landlord", password="LPassWord789!")
            tenant, t_token = self._create_user(session, "tenant_occ3", role="tenant", password="TPassWord789!")

            prop = Property(name="Khu H", landlord_id=landlord.id)
            session.add(prop)
            session.commit()
            session.refresh(prop)

            room = Room(room_number="601", property_id=prop.id, invite_code="INV601", status="active", tenant_id=tenant.id, current_people_count=1)
            session.add(room)
            session.commit()
            session.refresh(room)

            # Tenant creates request
            create_resp = self.client.post(
                f"/api/v1/rooms/{room.id}/occupancy-requests",
                json={
                    "new_people_count": 4,
                    "effective_date": "2026-09-20",
                    "note": "4 người",
                    "password": "TPassWord789!",
                },
                headers=self._auth_headers(t_token),
                session=session,
            )
            req_id = create_resp.json()["id"]

            # Landlord rejects
            rej_resp = self.client.post(
                f"/api/v1/occupancy-requests/{req_id}/reject",
                json={"reject_reason": "Phòng tối đa 2 người theo quy định khu trọ"},
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertEqual(rej_resp.status_code, 200)
            self.assertEqual(rej_resp.json()["status"], "rejected")
            self.assertEqual(rej_resp.json()["reject_reason"], "Phòng tối đa 2 người theo quy định khu trọ")

            # Room count remains unchanged
            session.refresh(room)
            self.assertEqual(room.current_people_count, 1)

    # ========================================================================
    # 4. Mid-Month Occupancy Change Prorated Invoice Calculation
    # ========================================================================

    def test_mid_month_occupancy_change_prorated_invoice(self) -> None:
        """When occupancy changes mid-month, invoice calculation applies prorated quota per TT 60/2025/TT-BCT."""
        with Session(self.engine) as session:
            landlord, l_token = self._create_user(session, "landlord_prorated", role="landlord", password="LPassword123!")
            tenant, t_token = self._create_user(session, "tenant_prorated", role="tenant")

            prop = Property(name="Khu Prorated", landlord_id=landlord.id, tariff_type="statutory")
            session.add(prop)
            session.commit()
            session.refresh(prop)

            room = Room(room_number="701", property_id=prop.id, invite_code="INV701", status="active", tenant_id=tenant.id, current_people_count=2)
            session.add(room)
            session.commit()
            session.refresh(room)

            # Suppose in September 2026 (30 days):
            # From day 1 to 10 (10 days): room had 1 person
            # From day 11 to 30 (20 days): room had 2 people (effective_date = 2026-09-11)
            occ_log = RoomOccupancyLog(
                room_id=room.id,
                old_count=1,
                new_count=2,
                effective_date="2026-09-11",
                approved_by_id=landlord.id,
                created_at=datetime(2026, 9, 11, 10, 0, 0, tzinfo=timezone.utc),
            )
            session.add(occ_log)
            session.commit()

            # Record meter reading for 2026-09: 150 kWh
            mr = MeterReading(
                room_id=room.id,
                month_year="2026-09",
                elec_start=100.0,
                elec_end=250.0,
                water_start=10.0,
                water_end=15.0,
            )
            session.add(mr)
            session.commit()

            # Calculate invoice for 2026-09
            inv_resp = self.client.post(
                f"/api/v1/rooms/{room.id}/invoices/calculate",
                json={
                    "month_year": "2026-09",
                    "elec_consumption": 150.0,
                    "water_usage": 5.0,
                    "actual_collected": None,
                },
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertIn(inv_resp.status_code, (200, 201))
            inv_data = inv_resp.json()
            import json
            breakdown = inv_data.get("breakdown") or json.loads(inv_data.get("breakdown_json", "{}"))

            # Verify prorated details in breakdown_data
            elec_breakdown = breakdown["electricity"]
            self.assertIn("occupancy_prorated", elec_breakdown)
            prorated_info = elec_breakdown["occupancy_prorated"]
            self.assertIsNotNone(prorated_info)
            self.assertTrue(prorated_info["is_prorated"])
            self.assertEqual(prorated_info["days_in_month"], 30)

            # Expected: 1 person * 10 days + 2 people * 20 days = 10 + 40 = 50 person-days
            self.assertEqual(prorated_info["total_person_days"], 50.0)

            # Quota: 50 / (4 * 30) = 50 / 120 = 0.416666... ~ 0.4167
            self.assertAlmostEqual(prorated_info["effective_quota"], 50.0 / 120.0, places=3)
            self.assertEqual(len(prorated_info["periods"]), 2)
            self.assertEqual(prorated_info["periods"][0]["days"], 10)
            self.assertEqual(prorated_info["periods"][0]["people_count"], 1)
            self.assertEqual(prorated_info["periods"][1]["days"], 20)
            self.assertEqual(prorated_info["periods"][1]["people_count"], 2)

    # ========================================================================
    # 5. Notifications for Occupancy Requests (Pending, Approved, Rejected)
    # ========================================================================

    def test_notifications_occupancy_requests_flow(self) -> None:
        """Verify that GET /api/v1/notifications correctly returns occupancy notifications for both Landlord and Tenant."""
        with Session(self.engine) as session:
            landlord, l_token = self._create_user(session, "landlord_notif", role="landlord", password="LandlordPass123!")
            tenant, t_token = self._create_user(session, "tenant_notif", role="tenant", password="TenantPass123!")

            prop = Property(name="Khu Notif", landlord_id=landlord.id)
            session.add(prop)
            session.commit()
            session.refresh(prop)

            room = Room(
                room_number="501",
                property_id=prop.id,
                invite_code="INV501",
                status="active",
                tenant_id=tenant.id,
                current_people_count=1,
            )
            session.add(room)
            session.commit()
            session.refresh(room)

            # 1. Tenant creates occupancy request -> Landlord should receive pending notification
            req_resp = self.client.post(
                f"/api/v1/rooms/{room.id}/occupancy-requests",
                json={
                    "new_people_count": 3,
                    "effective_date": "2026-09-15",
                    "note": "Bạn cùng phòng chuyển đến",
                    "password": "TenantPass123!",
                },
                headers=self._auth_headers(t_token),
                session=session,
            )
            self.assertEqual(req_resp.status_code, 201)
            req_data = req_resp.json()
            req_id = req_data["id"]

            # Query landlord notifications
            l_notifs_resp = self.client.get(
                "/api/v1/notifications",
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertEqual(l_notifs_resp.status_code, 200)
            l_notifs = l_notifs_resp.json()
            occ_pending = next((n for n in l_notifs if n.get("type") == "occupancy_request_pending"), None)
            self.assertIsNotNone(occ_pending)
            self.assertEqual(occ_pending["room_id"], room.id)
            self.assertEqual(occ_pending["request_id"], req_id)
            self.assertIn("3", occ_pending["message"])

            # 2. Landlord rejects the request -> Tenant should receive rejected notification
            rej_resp = self.client.post(
                f"/api/v1/occupancy-requests/{req_id}/reject",
                json={"reject_reason": "Chưa đăng ký tạm trú đầy đủ"},
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertEqual(rej_resp.status_code, 200)

            # Query tenant notifications
            t_notifs_resp = self.client.get(
                "/api/v1/notifications",
                headers=self._auth_headers(t_token),
                session=session,
            )
            self.assertEqual(t_notifs_resp.status_code, 200)
            t_notifs = t_notifs_resp.json()
            occ_rejected = next((n for n in t_notifs if n.get("type") == "occupancy_request_rejected"), None)
            self.assertIsNotNone(occ_rejected)
            self.assertEqual(occ_rejected["room_id"], room.id)
            self.assertEqual(occ_rejected["request_id"], req_id)
            self.assertIn("Chưa đăng ký tạm trú", occ_rejected["message"])

            # 3. Tenant creates another request and Landlord approves -> Tenant should receive approved notification
            req_resp2 = self.client.post(
                f"/api/v1/rooms/{room.id}/occupancy-requests",
                json={
                    "new_people_count": 2,
                    "effective_date": "2026-09-20",
                    "note": "Đã có đủ giấy tờ",
                    "password": "TenantPass123!",
                },
                headers=self._auth_headers(t_token),
                session=session,
            )
            self.assertEqual(req_resp2.status_code, 201)
            req_id2 = req_resp2.json()["id"]

            appr_resp = self.client.post(
                f"/api/v1/occupancy-requests/{req_id2}/approve",
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertEqual(appr_resp.status_code, 200)

            # Query tenant notifications again
            t_notifs_resp2 = self.client.get(
                "/api/v1/notifications",
                headers=self._auth_headers(t_token),
                session=session,
            )
            self.assertEqual(t_notifs_resp2.status_code, 200)
            t_notifs2 = t_notifs_resp2.json()
            occ_approved = next((n for n in t_notifs2 if n.get("type") == "occupancy_request_approved"), None)
            self.assertIsNotNone(occ_approved)
            self.assertEqual(occ_approved["room_id"], room.id)
            self.assertEqual(occ_approved["request_id"], req_id2)
            self.assertIn("2", occ_approved["message"])
