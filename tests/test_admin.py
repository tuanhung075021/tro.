# Copyright (c) 2026 tro. Contributors
# SPDX-License-Identifier: MIT
"""Comprehensive unit and integration tests for hidden Admin Easter Egg, RBAC, and Statutory Tariff System."""

import json
import os
import tempfile
import unittest
from typing import Dict, Tuple

from backend.app.auth import (
    get_current_user,
    register,
    require_admin,
    require_root_admin,
    reset_rate_limits,
)
from backend.app.compat import HTTPException, Session, TestClient, create_engine, select, status
from backend.app.database import hash_admin_secret, init_db
from backend.app.main import app
from backend.app.models import (
    AdminApprovalRequest,
    AdminSecretKey,
    SystemConfig,
    TariffChangeLog,
    User,
)
from backend.app.schemas import (
    AdminRejectIn,
    SecretRotateIn,
    TariffTierIn,
    TariffUpdateIn,
    UserRegister,
)
from backend.app.security import create_access_token
from backend.app.tariff_history import (
    get_latest_statutory_tariff,
    get_tariff_by_version,
)


class TestAdminSystem(unittest.TestCase):
    """Integration test suite covering Easter Egg auth, RBAC guards, and admin endpoints."""

    def setUp(self) -> None:
        """Create an isolated temporary SQLite database for each test case."""
        reset_rate_limits()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_admin.db")
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
        role: str = "tenant",
    ) -> Tuple[User, str]:
        """Helper to create and authenticate a user, returning the entity and JWT token."""
        user_reg = UserRegister(
            username=username,
            password="testPassword123!",
            full_name=f"Full {username}",
            phone="0901234567",
            role="tenant" if role in ("admin", "root_admin", "pending_admin") else role,
        )
        registered = register(user_reg, session=session)
        db_user = session.get(User, registered.id)
        if role in ("admin", "root_admin", "pending_admin"):
            db_user.role = role
            session.add(db_user)
            session.commit()
            session.refresh(db_user)

        token = create_access_token(
            {"sub": db_user.username, "user_id": db_user.id, "role": db_user.role}
        )
        return db_user, token

    def _auth_headers(self, token: str) -> Dict[str, str]:
        """Helper to generate standard Bearer authorization headers."""
        return {"Authorization": f"Bearer {token}"}

    # ========================================================================
    # 1. Easter Egg Registration & Obfuscation
    # ========================================================================

    def test_register_first_admin_auto_approved_as_root_admin(self) -> None:
        """First user registering with active secret key becomes root_admin automatically."""
        with Session(self.engine) as session:
            reg_data = UserRegister(
                username="admin_alpha::OHTLP_TRO.2026",
                password="adminSecretPassword123",
                full_name="Alpha Root Admin",
                phone="0911222333",
                role="tenant",
            )
            result = register(reg_data, session=session)

            self.assertEqual(result.username, "admin_alpha")
            self.assertEqual(result.role, "root_admin")

            db_user = session.get(User, result.id)
            self.assertIsNotNone(db_user)
            self.assertEqual(db_user.username, "admin_alpha")
            self.assertEqual(db_user.role, "root_admin")
            self.assertTrue(db_user.is_root_admin)
            self.assertTrue(db_user.is_admin)
            self.assertFalse(db_user.is_pending_admin)

            # First admin does NOT produce an approval request
            reqs = session.exec(select(AdminApprovalRequest)).all()
            self.assertEqual(len(reqs), 0)

    def test_register_subsequent_admin_becomes_pending_admin(self) -> None:
        """Second user registering with secret key gets pending_admin role and approval request."""
        with Session(self.engine) as session:
            # First admin (becomes root_admin)
            reg_first = UserRegister(
                username="admin_one::OHTLP_TRO.2026",
                password="password123",
                role="tenant",
            )
            first_user = register(reg_first, session=session)
            self.assertEqual(first_user.role, "root_admin")

            # Second admin
            reg_second = UserRegister(
                username="admin_two::OHTLP_TRO.2026",
                password="password456",
                full_name="Beta Pending Admin",
                phone="0988776655",
                role="tenant",
            )
            second_user = register(reg_second, session=session)
            self.assertEqual(second_user.username, "admin_two")
            self.assertEqual(second_user.role, "pending_admin")

            db_user = session.get(User, second_user.id)
            self.assertEqual(db_user.role, "pending_admin")
            self.assertTrue(db_user.is_pending_admin)
            self.assertFalse(db_user.is_admin)
            self.assertFalse(db_user.is_root_admin)

            # Verification of AdminApprovalRequest
            reqs = session.exec(
                select(AdminApprovalRequest).where(AdminApprovalRequest.user_id == second_user.id)
            ).all()
            self.assertEqual(len(reqs), 1)
            self.assertEqual(reqs[0].status, "pending")
            self.assertIsNone(reqs[0].reviewed_by_id)

    def test_register_invalid_secret_key_fails_silently_with_regex_error(self) -> None:
        """Invalid secret key must fail with standard username regex error, concealing secret key existence."""
        with Session(self.engine) as session:
            reg_data = UserRegister(
                username="attacker::INCORRECT_KEY",
                password="password123",
                role="tenant",
            )
            with self.assertRaises(HTTPException) as ctx:
                register(reg_data, session=session)

            self.assertEqual(ctx.exception.status_code, 400)
            self.assertEqual(
                ctx.exception.detail,
                "Tên đăng nhập chỉ được chứa ký tự chữ và số, không chứa ký tự đặc biệt",
            )
            # Ensure no leaked data or user creation
            users = session.exec(select(User)).all()
            self.assertEqual(len(users), 0)

    def test_register_admin_invalid_clean_username_fails(self) -> None:
        """Valid secret key with invalid clean username (< 3 chars or special chars) raises 400 regex error."""
        with Session(self.engine) as session:
            # Too short (< 3 chars)
            reg_short = UserRegister(
                username="ab::OHTLP_TRO.2026",
                password="password123",
                role="tenant",
            )
            with self.assertRaises(HTTPException) as ctx:
                register(reg_short, session=session)
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertEqual(
                ctx.exception.detail,
                "Tên đăng nhập chỉ được chứa ký tự chữ và số, không chứa ký tự đặc biệt",
            )

            # Special characters
            reg_special = UserRegister(
                username="admin-bad::OHTLP_TRO.2026",
                password="password123",
                role="tenant",
            )
            with self.assertRaises(HTTPException) as ctx:
                register(reg_special, session=session)
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertEqual(
                ctx.exception.detail,
                "Tên đăng nhập chỉ được chứa ký tự chữ và số, không chứa ký tự đặc biệt",
            )

    def test_register_admin_collision_fails(self) -> None:
        """Registering with an already existing clean username raises 400 duplicate error."""
        with Session(self.engine) as session:
            existing = UserRegister(
                username="shared_user",
                password="password123",
                role="tenant",
            )
            register(existing, session=session)

            # Attempt to claim with secret key
            collision_reg = UserRegister(
                username="shared_user::OHTLP_TRO.2026",
                password="password456",
                role="tenant",
            )
            with self.assertRaises(HTTPException) as ctx:
                register(collision_reg, session=session)
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("Tên đăng nhập đã tồn tại", ctx.exception.detail)

    def test_register_normal_users_succeeds(self) -> None:
        """Normal landlord and tenant registrations without :: proceed as usual."""
        with Session(self.engine) as session:
            landlord_reg = UserRegister(
                username="landlord_bob",
                password="password123",
                role="landlord",
            )
            l_res = register(landlord_reg, session=session)
            self.assertEqual(l_res.username, "landlord_bob")
            self.assertEqual(l_res.role, "landlord")

            tenant_reg = UserRegister(
                username="tenant_alice",
                password="password123",
                role="tenant",
            )
            t_res = register(tenant_reg, session=session)
            self.assertEqual(t_res.username, "tenant_alice")
            self.assertEqual(t_res.role, "tenant")

    # ========================================================================
    # 2. RBAC Dependencies
    # ========================================================================

    def test_require_admin_dependency(self) -> None:
        """require_admin grants access to admin and root_admin, denies all others."""
        with Session(self.engine) as session:
            root_u, _ = self._create_user(session, "u_root", role="root_admin")
            admin_u, _ = self._create_user(session, "u_admin", role="admin")
            pending_u, _ = self._create_user(session, "u_pending", role="pending_admin")
            landlord_u, _ = self._create_user(session, "u_landlord", role="landlord")
            tenant_u, _ = self._create_user(session, "u_tenant", role="tenant")

            self.assertEqual(require_admin(root_u).id, root_u.id)
            self.assertEqual(require_admin(admin_u).id, admin_u.id)

            for non_admin in (pending_u, landlord_u, tenant_u):
                with self.assertRaises(HTTPException) as ctx:
                    require_admin(non_admin)
                self.assertEqual(ctx.exception.status_code, 403)
                self.assertEqual(ctx.exception.detail, "Yêu cầu quyền Quản trị viên")

    def test_require_root_admin_dependency(self) -> None:
        """require_root_admin grants access only to root_admin, denies all others."""
        with Session(self.engine) as session:
            root_u, _ = self._create_user(session, "u_root2", role="root_admin")
            admin_u, _ = self._create_user(session, "u_admin2", role="admin")
            pending_u, _ = self._create_user(session, "u_pending2", role="pending_admin")
            landlord_u, _ = self._create_user(session, "u_landlord2", role="landlord")
            tenant_u, _ = self._create_user(session, "u_tenant2", role="tenant")

            self.assertEqual(require_root_admin(root_u).id, root_u.id)

            for non_root in (admin_u, pending_u, landlord_u, tenant_u):
                with self.assertRaises(HTTPException) as ctx:
                    require_root_admin(non_root)
                self.assertEqual(ctx.exception.status_code, 403)
                self.assertEqual(ctx.exception.detail, "Yêu cầu quyền Root Admin")

    # ========================================================================
    # 3. Admin Approval Workflow (API Endpoints)
    # ========================================================================

    def test_get_admin_requests_endpoint(self) -> None:
        """Root Admin can list pending requests; non-root admins receive 403."""
        with Session(self.engine) as session:
            root_u, root_tok = self._create_user(session, "root_boss", role="root_admin")
            admin_u, admin_tok = self._create_user(session, "admin_staff", role="admin")

            # Create pending admin registration
            reg_second = UserRegister(
                username="newbie_admin::OHTLP_TRO.2026",
                password="password123",
                full_name="Newbie Admin",
                phone="0933333333",
                role="tenant",
            )
            register(reg_second, session=session)

            # Root admin queries pending requests
            resp = self.client.get(
                "/api/v1/admin/requests",
                headers=self._auth_headers(root_tok),
                session=session,
            )
            self.assertEqual(resp.status_code, 200)
            items = resp.json()
            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]["username"], "newbie_admin")
            self.assertEqual(items[0]["full_name"], "Newbie Admin")
            self.assertEqual(items[0]["status"], "pending")

            # Regular admin cannot view requests (requires root_admin)
            resp_forbidden = self.client.get(
                "/api/v1/admin/requests",
                headers=self._auth_headers(admin_tok),
                session=session,
            )
            self.assertEqual(resp_forbidden.status_code, 403)

    def test_approve_admin_request_endpoint(self) -> None:
        """Root Admin approves request, promoting user to admin; approved admin can access admin API."""
        with Session(self.engine) as session:
            root_u, root_tok = self._create_user(session, "approver_root", role="root_admin")

            reg_second = UserRegister(
                username="promoted_admin::OHTLP_TRO.2026",
                password="password123",
                role="tenant",
            )
            cand = register(reg_second, session=session)
            cand_user = session.get(User, cand.id)
            cand_tok = create_access_token({"sub": cand_user.username, "user_id": cand_user.id, "role": cand_user.role})

            # Candidate initially cannot access admin tariff
            resp_denied = self.client.get(
                "/api/v1/admin/tariff",
                headers=self._auth_headers(cand_tok),
                session=session,
            )
            self.assertEqual(resp_denied.status_code, 403)

            req = session.exec(
                select(AdminApprovalRequest).where(AdminApprovalRequest.user_id == cand.id)
            ).first()
            self.assertIsNotNone(req)

            # Root admin approves
            approve_resp = self.client.post(
                f"/api/v1/admin/requests/{req.id}/approve",
                headers=self._auth_headers(root_tok),
                session=session,
            )
            self.assertEqual(approve_resp.status_code, 200)
            approved_data = approve_resp.json()
            self.assertEqual(approved_data["status"], "approved")

            session.refresh(cand_user)
            self.assertEqual(cand_user.role, "admin")

            # New token with admin role allows accessing admin tariff
            new_cand_tok = create_access_token({"sub": cand_user.username, "user_id": cand_user.id, "role": cand_user.role})
            resp_allowed = self.client.get(
                "/api/v1/admin/tariff",
                headers=self._auth_headers(new_cand_tok),
                session=session,
            )
            self.assertEqual(resp_allowed.status_code, 200)

    def test_reject_admin_request_endpoint(self) -> None:
        """Root Admin rejects request, reverting user to tenant."""
        with Session(self.engine) as session:
            root_u, root_tok = self._create_user(session, "rejector_root", role="root_admin")

            reg_second = UserRegister(
                username="rejected_cand::OHTLP_TRO.2026",
                password="password123",
                role="tenant",
            )
            cand = register(reg_second, session=session)
            req = session.exec(
                select(AdminApprovalRequest).where(AdminApprovalRequest.user_id == cand.id)
            ).first()

            reject_resp = self.client.post(
                f"/api/v1/admin/requests/{req.id}/reject",
                headers=self._auth_headers(root_tok),
                json={"reject_reason": "Lý do từ chối thử nghiệm"},
                session=session,
            )
            self.assertEqual(reject_resp.status_code, 200)
            rej_data = reject_resp.json()
            self.assertEqual(rej_data["status"], "rejected")
            self.assertEqual(rej_data["reject_reason"], "Lý do từ chối thử nghiệm")

            cand_user = session.get(User, cand.id)
            self.assertEqual(cand_user.role, "tenant")

    def test_approve_reject_nonexistent_request(self) -> None:
        """Approving or rejecting non-existent request returns 404."""
        with Session(self.engine) as session:
            root_u, root_tok = self._create_user(session, "root_missing", role="root_admin")

            resp_app = self.client.post(
                "/api/v1/admin/requests/99999/approve",
                headers=self._auth_headers(root_tok),
                session=session,
            )
            self.assertEqual(resp_app.status_code, 404)

            resp_rej = self.client.post(
                "/api/v1/admin/requests/99999/reject",
                headers=self._auth_headers(root_tok),
                json={"reject_reason": "None"},
                session=session,
            )
            self.assertEqual(resp_rej.status_code, 404)

    # ========================================================================
    # 4. Admin Promotion & Demotion
    # ========================================================================

    def test_list_admins_endpoint(self) -> None:
        """Root Admin can list all admins and root_admins."""
        with Session(self.engine) as session:
            root_u, root_tok = self._create_user(session, "list_root", role="root_admin")
            admin_u, _ = self._create_user(session, "list_admin", role="admin")
            tenant_u, _ = self._create_user(session, "list_tenant", role="tenant")

            resp = self.client.get(
                "/api/v1/admin/admins",
                headers=self._auth_headers(root_tok),
                session=session,
            )
            self.assertEqual(resp.status_code, 200)
            usernames = [u["username"] for u in resp.json()]
            self.assertIn("list_root", usernames)
            self.assertIn("list_admin", usernames)
            self.assertNotIn("list_tenant", usernames)

    def test_promote_admin_to_root_admin(self) -> None:
        """Root Admin can promote an admin to root_admin; promoting non-admin fails."""
        with Session(self.engine) as session:
            root_u, root_tok = self._create_user(session, "promoter_root", role="root_admin")
            admin_u, _ = self._create_user(session, "promotable_admin", role="admin")
            tenant_u, _ = self._create_user(session, "tenant_target", role="tenant")

            # Promote admin -> root_admin
            resp = self.client.post(
                f"/api/v1/admin/promote/{admin_u.id}",
                headers=self._auth_headers(root_tok),
                session=session,
            )
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json()["role"], "root_admin")
            self.assertTrue(resp.json()["is_root_admin"])

            session.refresh(admin_u)
            self.assertEqual(admin_u.role, "root_admin")

            # Promote tenant -> fails with 400
            resp_tenant = self.client.post(
                f"/api/v1/admin/promote/{tenant_u.id}",
                headers=self._auth_headers(root_tok),
                session=session,
            )
            self.assertEqual(resp_tenant.status_code, 400)
            self.assertIn("Chỉ có thể nâng cấp tài khoản Admin", resp_tenant.json()["detail"])

    def test_demote_root_admin_when_multiple_exist(self) -> None:
        """Demoting a root_admin to admin succeeds when multiple root admins exist."""
        with Session(self.engine) as session:
            root1, root1_tok = self._create_user(session, "root_alpha", role="root_admin")
            root2, _ = self._create_user(session, "root_beta", role="root_admin")

            resp = self.client.post(
                f"/api/v1/admin/demote/{root2.id}",
                headers=self._auth_headers(root1_tok),
                session=session,
            )
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json()["role"], "admin")

            session.refresh(root2)
            self.assertEqual(root2.role, "admin")

    def test_demote_sole_root_admin_is_prevented(self) -> None:
        """Demoting the sole root_admin must fail with HTTP 400 and protect the system."""
        with Session(self.engine) as session:
            sole_root, sole_tok = self._create_user(session, "sole_root", role="root_admin")

            resp = self.client.post(
                f"/api/v1/admin/demote/{sole_root.id}",
                headers=self._auth_headers(sole_tok),
                session=session,
            )
            self.assertEqual(resp.status_code, 400)
            self.assertIn("Không thể hạ quyền Root Admin duy nhất của hệ thống", resp.json()["detail"])

            session.refresh(sole_root)
            self.assertEqual(sole_root.role, "root_admin")

    # ========================================================================
    # 5. Secret Key Rotation
    # ========================================================================

    def test_rotate_secret_key_success_and_invalidation(self) -> None:
        """Key rotation deactivates old key, invalidates pending requests, and enables registration with new key."""
        with Session(self.engine) as session:
            root_u, root_tok = self._create_user(session, "rotator_root", role="root_admin")

            # Register pending admin under old key
            reg_pending = UserRegister(
                username="pending_before_rot::OHTLP_TRO.2026",
                password="password123",
                role="tenant",
            )
            cand = register(reg_pending, session=session)
            req = session.exec(
                select(AdminApprovalRequest).where(AdminApprovalRequest.user_id == cand.id)
            ).first()
            self.assertEqual(req.status, "pending")

            # Rotate secret key (requires root admin's own password)
            rotate_resp = self.client.post(
                "/api/v1/admin/secret/rotate",
                headers=self._auth_headers(root_tok),
                json={
                    "new_secret": "NEW_SECRET_PASS_2026",
                    "admin_password": "testPassword123!",
                },
                session=session,
            )
            self.assertEqual(rotate_resp.status_code, 200)
            self.assertIn("key_id", rotate_resp.json())

            # Verify prior pending request was rejected
            session.refresh(req)
            self.assertEqual(req.status, "rejected")
            self.assertEqual(req.reject_reason, "Secret key đã được xoay vòng")

            # Old key registration now fails silently
            old_reg = UserRegister(
                username="try_old_key::OHTLP_TRO.2026",
                password="password123",
                role="tenant",
            )
            with self.assertRaises(HTTPException) as ctx:
                register(old_reg, session=session)
            self.assertEqual(ctx.exception.status_code, 400)

            # New key registration succeeds
            new_reg = UserRegister(
                username="fresh_admin::NEW_SECRET_PASS_2026",
                password="password123",
                role="tenant",
            )
            new_res = register(new_reg, session=session)
            self.assertEqual(new_res.username, "fresh_admin")
            self.assertEqual(new_res.role, "pending_admin")

    def test_rotate_secret_key_wrong_password_fails(self) -> None:
        """Rotating secret key with incorrect admin password raises HTTP 400."""
        with Session(self.engine) as session:
            root_u, root_tok = self._create_user(session, "rot_wrong_pwd", role="root_admin")
            resp = self.client.post(
                "/api/v1/admin/secret/rotate",
                headers=self._auth_headers(root_tok),
                json={
                    "new_secret": "VALID_NEW_KEY_2026",
                    "admin_password": "WrongPassword999!",
                },
                session=session,
            )
            self.assertEqual(resp.status_code, 400)
            self.assertEqual(resp.json()["detail"], "Mật khẩu quản trị viên không chính xác")

    def test_rotate_secret_key_short_rejected(self) -> None:
        """Secret key < 8 characters is rejected with 400."""
        with Session(self.engine) as session:
            root_u, root_tok = self._create_user(session, "rot_short", role="root_admin")
            resp = self.client.post(
                "/api/v1/admin/secret/rotate",
                headers=self._auth_headers(root_tok),
                json={
                    "new_secret": "short1",
                    "admin_password": "testPassword123!",
                },
                session=session,
            )
            self.assertIn(resp.status_code, (400, 422))

    def test_reveal_secret_key_success(self) -> None:
        """Root admin entering their own password successfully reveals the active secret key."""
        with Session(self.engine) as session:
            root_u, root_tok = self._create_user(session, "reveal_root", role="root_admin")
            resp = self.client.post(
                "/api/v1/admin/secret/reveal",
                headers=self._auth_headers(root_tok),
                json={"admin_password": "testPassword123!"},
                session=session,
            )
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json()["active_secret_key"], "OHTLP_TRO.2026")

    def test_reveal_secret_key_wrong_password_fails(self) -> None:
        """Root admin entering incorrect password cannot reveal secret key (HTTP 400)."""
        with Session(self.engine) as session:
            root_u, root_tok = self._create_user(session, "reveal_fail_root", role="root_admin")
            resp = self.client.post(
                "/api/v1/admin/secret/reveal",
                headers=self._auth_headers(root_tok),
                json={"admin_password": "incorrectPassword!!!"},
                session=session,
            )
            self.assertEqual(resp.status_code, 400)
            self.assertEqual(resp.json()["detail"], "Mật khẩu quản trị viên không chính xác")

    def test_change_password_success(self) -> None:
        """Any authenticated user can change password by confirming their old password."""
        with Session(self.engine) as session:
            user, token = self._create_user(session, "pwd_changer", role="tenant")
            resp = self.client.post(
                "/api/v1/auth/change-password",
                headers=self._auth_headers(token),
                json={
                    "current_password": "testPassword123!",
                    "new_password": "newSecurePassword2026!",
                    "confirm_password": "newSecurePassword2026!",
                },
                session=session,
            )
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json()["message"], "Đổi mật khẩu thành công")

    def test_change_password_wrong_current_fails(self) -> None:
        """Changing password with wrong current password returns HTTP 400."""
        with Session(self.engine) as session:
            user, token = self._create_user(session, "pwd_wrong_cur", role="landlord")
            resp = self.client.post(
                "/api/v1/auth/change-password",
                headers=self._auth_headers(token),
                json={
                    "current_password": "TotallyWrongPassword!",
                    "new_password": "brandNewPassword2026!",
                    "confirm_password": "brandNewPassword2026!",
                },
                session=session,
            )
            self.assertEqual(resp.status_code, 400)
            self.assertEqual(resp.json()["detail"], "Mật khẩu hiện tại không chính xác")

    def test_change_password_mismatch_fails(self) -> None:
        """Changing password with mismatched confirmation returns HTTP 400."""
        with Session(self.engine) as session:
            user, token = self._create_user(session, "pwd_mismatch", role="tenant")
            resp = self.client.post(
                "/api/v1/auth/change-password",
                headers=self._auth_headers(token),
                json={
                    "current_password": "testPassword123!",
                    "new_password": "brandNewPassword2026!",
                    "confirm_password": "differentPassword2026!",
                },
                session=session,
            )
            self.assertEqual(resp.status_code, 400)
            self.assertEqual(resp.json()["detail"], "Mật khẩu xác nhận không khớp với mật khẩu mới")

    def test_change_password_same_as_old_fails(self) -> None:
        """Changing password to identical old password returns HTTP 400."""
        with Session(self.engine) as session:
            user, token = self._create_user(session, "pwd_same_old", role="admin")
            resp = self.client.post(
                "/api/v1/auth/change-password",
                headers=self._auth_headers(token),
                json={
                    "current_password": "testPassword123!",
                    "new_password": "testPassword123!",
                    "confirm_password": "testPassword123!",
                },
                session=session,
            )
            self.assertEqual(resp.status_code, 400)
            self.assertEqual(resp.json()["detail"], "Mật khẩu mới không được trùng với mật khẩu hiện tại")

    # ========================================================================
    # 6. Centralized Statutory Tariff Management
    # ========================================================================

    def test_get_admin_tariff_endpoint(self) -> None:
        """Admin can retrieve current system pricing configuration and statutory details."""
        with Session(self.engine) as session:
            admin_u, admin_tok = self._create_user(session, "tariff_admin", role="admin")

            resp = self.client.get(
                "/api/v1/admin/tariff",
                headers=self._auth_headers(admin_tok),
                session=session,
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["tariff_version"], "QD-1279-2023")
            self.assertEqual(len(data["electricity_tiers"]), 6)
            self.assertEqual(data["vat_rate"], 0.08)
            self.assertEqual(data["water_rate"], 8500.0)

    def test_put_admin_tariff_valid_progressive(self) -> None:
        """Admin updates tariff with strictly increasing tier prices, recording TariffChangeLog."""
        with Session(self.engine) as session:
            admin_u, admin_tok = self._create_user(session, "updater_admin", role="admin")

            valid_tiers = [
                {"tier_name": "Bậc 1", "min_kwh": 0, "max_kwh": 50, "unit_price": 2000.0},
                {"tier_name": "Bậc 2", "min_kwh": 51, "max_kwh": 100, "unit_price": 2100.0},
                {"tier_name": "Bậc 3", "min_kwh": 101, "max_kwh": 200, "unit_price": 2400.0},
                {"tier_name": "Bậc 4", "min_kwh": 201, "max_kwh": 300, "unit_price": 3000.0},
                {"tier_name": "Bậc 5", "min_kwh": 301, "max_kwh": 400, "unit_price": 3400.0},
                {"tier_name": "Bậc 6", "min_kwh": 401, "max_kwh": None, "unit_price": 3500.0},
            ]

            payload = {
                "electricity_tiers": valid_tiers,
                "vat_rate": 0.08,
                "water_rate": 9000.0,
                "note": "Điều chỉnh biểu giá quý 4/2026",
                "tariff_version": "CUSTOM-2026-Q4",
            }

            resp = self.client.put(
                "/api/v1/admin/tariff",
                headers=self._auth_headers(admin_tok),
                json=payload,
                session=session,
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["tariff_version"], "CUSTOM-2026-Q4")
            self.assertEqual(data["water_rate"], 9000.0)

            # Check DB SystemConfig
            config = session.get(SystemConfig, 1)
            self.assertEqual(config.tariff_version, "CUSTOM-2026-Q4")
            self.assertEqual(config.water_unit_price, 9000.0)
            self.assertEqual(config.electricity_tier3_price, 2400.0)

            # Check TariffChangeLog
            logs = session.exec(select(TariffChangeLog)).all()
            self.assertEqual(len(logs), 1)
            self.assertEqual(logs[0].tariff_version, "CUSTOM-2026-Q4")
            self.assertEqual(logs[0].changed_by_id, admin_u.id)
            self.assertEqual(logs[0].note, "Điều chỉnh biểu giá quý 4/2026")

    def test_put_admin_tariff_rejects_non_monotonic_tiers(self) -> None:
        """Updating tariff with tier[i+1] <= tier[i] raises HTTP 400."""
        with Session(self.engine) as session:
            admin_u, admin_tok = self._create_user(session, "bad_admin", role="admin")

            # Tier 3 (2100) < Tier 2 (2200)
            invalid_tiers = [
                {"tier_name": "Bậc 1", "min_kwh": 0, "max_kwh": 50, "unit_price": 2000.0},
                {"tier_name": "Bậc 2", "min_kwh": 51, "max_kwh": 100, "unit_price": 2200.0},
                {"tier_name": "Bậc 3", "min_kwh": 101, "max_kwh": 200, "unit_price": 2100.0},
                {"tier_name": "Bậc 4", "min_kwh": 201, "max_kwh": 300, "unit_price": 3000.0},
                {"tier_name": "Bậc 5", "min_kwh": 301, "max_kwh": 400, "unit_price": 3400.0},
                {"tier_name": "Bậc 6", "min_kwh": 401, "max_kwh": None, "unit_price": 3500.0},
            ]

            payload = {
                "electricity_tiers": invalid_tiers,
                "vat_rate": 0.08,
                "water_rate": 8500.0,
            }

            resp = self.client.put(
                "/api/v1/admin/tariff",
                headers=self._auth_headers(admin_tok),
                json=payload,
                session=session,
            )
            self.assertEqual(resp.status_code, 400)
            self.assertIn("Giá bậc sau phải lớn hơn bậc trước", resp.json()["detail"])

    def test_put_admin_tariff_rejects_invalid_tier_count(self) -> None:
        """Updating tariff with fewer than 6 tiers raises HTTP 400."""
        with Session(self.engine) as session:
            admin_u, admin_tok = self._create_user(session, "five_tiers_admin", role="admin")

            five_tiers = [
                {"tier_name": "Bậc 1", "min_kwh": 0, "max_kwh": 50, "unit_price": 2000.0},
                {"tier_name": "Bậc 2", "min_kwh": 51, "max_kwh": 100, "unit_price": 2200.0},
                {"tier_name": "Bậc 3", "min_kwh": 101, "max_kwh": 200, "unit_price": 2500.0},
                {"tier_name": "Bậc 4", "min_kwh": 201, "max_kwh": 300, "unit_price": 3000.0},
                {"tier_name": "Bậc 5", "min_kwh": 301, "max_kwh": 400, "unit_price": 3400.0},
            ]

            payload = {
                "electricity_tiers": five_tiers,
                "vat_rate": 0.08,
                "water_rate": 8500.0,
            }

            resp = self.client.put(
                "/api/v1/admin/tariff",
                headers=self._auth_headers(admin_tok),
                json=payload,
                session=session,
            )
            self.assertEqual(resp.status_code, 400)
            self.assertIn("6 bậc", resp.json()["detail"])

    def test_get_tariff_history(self) -> None:
        """Admin can view the chronological history of tariff modifications."""
        with Session(self.engine) as session:
            admin_u, admin_tok = self._create_user(session, "history_admin", role="admin")

            # Create 2 logs directly or via PUT
            log1 = TariffChangeLog(
                changed_by_id=admin_u.id,
                tariff_version="CUSTOM-V1",
                snapshot_json="{}",
                note="Update 1",
            )
            log2 = TariffChangeLog(
                changed_by_id=admin_u.id,
                tariff_version="CUSTOM-V2",
                snapshot_json="{}",
                note="Update 2",
            )
            session.add(log1)
            session.add(log2)
            session.commit()

            resp = self.client.get(
                "/api/v1/admin/tariff/history",
                headers=self._auth_headers(admin_tok),
                session=session,
            )
            self.assertEqual(resp.status_code, 200)
            items = resp.json()
            self.assertEqual(len(items), 2)
            self.assertEqual(items[0]["changed_by_username"], "history_admin")

    def test_reset_tariff_to_statutory_version(self) -> None:
        """Admin can reset SystemConfig back to statutory decree version QD-1279-2023."""
        with Session(self.engine) as session:
            admin_u, admin_tok = self._create_user(session, "reseter_admin", role="admin")

            # Alter config first
            cfg = session.get(SystemConfig, 1)
            cfg.water_unit_price = 15000.0
            cfg.tariff_version = "MODIFIED-CUSTOM"
            session.add(cfg)
            session.commit()

            # Execute reset
            resp = self.client.post(
                "/api/v1/admin/tariff/reset/QD-1279-2023",
                headers=self._auth_headers(admin_tok),
                session=session,
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["tariff_version"], "QD-1279-2023")
            self.assertEqual(data["water_rate"], 8500.0)

            session.refresh(cfg)
            self.assertEqual(cfg.water_unit_price, 8500.0)
            self.assertEqual(cfg.tariff_version, "QD-1279-2023")

            # Check change log recorded
            logs = session.exec(select(TariffChangeLog)).all()
            self.assertEqual(len(logs), 1)
            self.assertIn("Khôi phục về biểu giá chuẩn QD-1279-2023", logs[0].note)

    def test_reset_tariff_invalid_version_returns_404(self) -> None:
        """Resetting to an unknown statutory version returns HTTP 404."""
        with Session(self.engine) as session:
            admin_u, admin_tok = self._create_user(session, "bad_reset_admin", role="admin")

            resp = self.client.post(
                "/api/v1/admin/tariff/reset/UNKNOWN-VERSION-999",
                headers=self._auth_headers(admin_tok),
                session=session,
            )
            self.assertEqual(resp.status_code, 404)

    def test_tariff_endpoints_forbidden_for_non_admin(self) -> None:
        """Landlords and tenants cannot access tariff configuration management endpoints."""
        with Session(self.engine) as session:
            tenant_u, tenant_tok = self._create_user(session, "tenant_blocked", role="tenant")
            landlord_u, landlord_tok = self._create_user(session, "landlord_blocked", role="landlord")

            for tok in (tenant_tok, landlord_tok):
                headers = self._auth_headers(tok)
                r1 = self.client.get("/api/v1/admin/tariff", headers=headers, session=session)
                self.assertEqual(r1.status_code, 403)

                r2 = self.client.put(
                    "/api/v1/admin/tariff",
                    headers=headers,
                    json={"electricity_tiers": [], "vat_rate": 0.08, "water_rate": 8500.0},
                    session=session,
                )
                self.assertEqual(r2.status_code, 403)

                r3 = self.client.get("/api/v1/admin/tariff/history", headers=headers, session=session)
                self.assertEqual(r3.status_code, 403)

                r4 = self.client.post(
                    "/api/v1/admin/tariff/reset/QD-1279-2023",
                    headers=headers,
                    session=session,
                )
                self.assertEqual(r4.status_code, 403)

    # ========================================================================
    # 7. Static Statutory Tariff Catalogue Tests
    # ========================================================================

    def test_tariff_history_catalog(self) -> None:
        """Verify statutory tariff helper functions in tariff_history.py."""
        latest = get_latest_statutory_tariff()
        self.assertIsNotNone(latest)
        self.assertEqual(latest["version"], "QD-1279-2023")
        self.assertEqual(len(latest["tiers"]), 6)

        by_version = get_tariff_by_version("QD-1279-2023")
        self.assertIsNotNone(by_version)
        self.assertEqual(by_version["electricity_tier3_price"], 2380.0)

        none_version = get_tariff_by_version("NONEXISTENT")
        self.assertIsNone(none_version)

    # ========================================================================
    # 8. Database Seeding & Idempotency
    # ========================================================================

    def test_init_db_idempotent_admin_secret_key(self) -> None:
        """init_db creates exactly one active secret key; multiple invocations preserve it."""
        with Session(self.engine) as session:
            keys = session.exec(select(AdminSecretKey)).all()
            self.assertEqual(len(keys), 1)
            self.assertTrue(keys[0].is_active)
            self.assertEqual(keys[0].hashed_secret, hash_admin_secret("OHTLP_TRO.2026"))

        # Second init_db run on same engine
        init_db(self.engine)

        with Session(self.engine) as session:
            keys_after = session.exec(select(AdminSecretKey)).all()
            self.assertEqual(len(keys_after), 1)


    # ========================================================================
    # 9. Dynamic Legal Decrees & Fallback Tier Mechanism Tests
    # ========================================================================

    def test_public_get_config_without_token(self) -> None:
        """GET /api/v1/config is publicly accessible without token and returns legal basis fields."""
        with Session(self.engine) as session:
            resp = self.client.get("/api/v1/config", session=session)
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["tariff_version"], "QD-1279-2023")
            self.assertEqual(data["fallback_tier_number"], 3)
            self.assertIn("1279", data["legal_basis_elec"])
            self.assertIn("204", data["legal_basis_vat"])
            self.assertIn("104", data["compliance_decree"])
            self.assertIn("20.000.000", data["penalty_text"])

    def test_admin_update_dynamic_legal_and_fallback_tier(self) -> None:
        """Admin updates legal basis texts, fallback tier (Bậc 4), water VAT, and env fee."""
        with Session(self.engine) as session:
            admin_u, admin_tok = self._create_user(session, "legal_admin", role="admin")

            valid_tiers = [
                {"tier_name": "Bậc 1", "min_kwh": 0, "max_kwh": 50, "unit_price": 2000.0},
                {"tier_name": "Bậc 2", "min_kwh": 51, "max_kwh": 100, "unit_price": 2100.0},
                {"tier_name": "Bậc 3", "min_kwh": 101, "max_kwh": 200, "unit_price": 2400.0},
                {"tier_name": "Bậc 4", "min_kwh": 201, "max_kwh": 300, "unit_price": 3000.0},
                {"tier_name": "Bậc 5", "min_kwh": 301, "max_kwh": 400, "unit_price": 3400.0},
                {"tier_name": "Bậc 6", "min_kwh": 401, "max_kwh": None, "unit_price": 3500.0},
            ]

            payload = {
                "electricity_tiers": valid_tiers,
                "vat_rate": 0.10,
                "water_rate": 9500.0,
                "water_vat_rate": 0.08,
                "water_env_fee_rate": 0.15,
                "fallback_tier_number": 4,
                "legal_basis_elec": "Quyết định Mới 2026",
                "legal_basis_vat": "Nghị quyết Thuế 2026",
                "compliance_decree": "Nghị định Xử phạt Mới",
                "penalty_text": "30 - 50 triệu đồng",
                "tier3_rule_note": "Thông tư Mới 2026",
                "tariff_version": "QD-NEW-2026",
                "note": "Cập nhật chính sách toàn diện",
            }

            resp = self.client.put(
                "/api/v1/admin/tariff",
                headers=self._auth_headers(admin_tok),
                json=payload,
                session=session,
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["tariff_version"], "QD-NEW-2026")
            self.assertEqual(data["fallback_tier_number"], 4)
            self.assertEqual(data["water_vat_rate"], 0.08)
            self.assertEqual(data["water_env_fee_rate"], 0.15)
            self.assertEqual(data["legal_basis_elec"], "Quyết định Mới 2026")
            self.assertEqual(data["legal_basis_vat"], "Nghị quyết Thuế 2026")
            self.assertEqual(data["compliance_decree"], "Nghị định Xử phạt Mới")
            self.assertEqual(data["penalty_text"], "30 - 50 triệu đồng")

            # Check DB SystemConfig
            cfg = session.get(SystemConfig, 1)
            self.assertEqual(cfg.fallback_tier_number, 4)
            self.assertEqual(cfg.compliance_decree, "Nghị định Xử phạt Mới")
            self.assertEqual(cfg.penalty_text, "30 - 50 triệu đồng")

    def test_invoice_calculation_uses_configured_fallback_tier(self) -> None:
        """When room has no quota, electricity is calculated using the configured fallback tier price."""
        with Session(self.engine) as session:
            admin_u, admin_tok = self._create_user(session, "fb_admin", role="admin")
            landlord, l_token = self._create_user(session, "fb_landlord", role="landlord")

            # 1. Admin configures fallback tier = 4 (price 3000.0)
            tiers = [
                {"tier_name": "Bậc 1", "min_kwh": 0, "max_kwh": 50, "unit_price": 2000.0},
                {"tier_name": "Bậc 2", "min_kwh": 51, "max_kwh": 100, "unit_price": 2100.0},
                {"tier_name": "Bậc 3", "min_kwh": 101, "max_kwh": 200, "unit_price": 2400.0},
                {"tier_name": "Bậc 4", "min_kwh": 201, "max_kwh": 300, "unit_price": 3000.0},
                {"tier_name": "Bậc 5", "min_kwh": 301, "max_kwh": 400, "unit_price": 3400.0},
                {"tier_name": "Bậc 6", "min_kwh": 401, "max_kwh": None, "unit_price": 3500.0},
            ]
            self.client.put(
                "/api/v1/admin/tariff",
                headers=self._auth_headers(admin_tok),
                json={
                    "electricity_tiers": tiers,
                    "vat_rate": 0.08,
                    "water_rate": 8500.0,
                    "fallback_tier_number": 4,
                },
                session=session,
            )

            # 2. Landlord creates room with 0 people (no registered quota)
            p_res = self.client.post(
                "/api/v1/properties",
                json={"name": "Khu Tro Fallback"},
                headers=self._auth_headers(l_token),
                session=session,
            )
            prop_id = p_res.json()["id"]
            r_res = self.client.post(
                f"/api/v1/properties/{prop_id}/rooms",
                json={"room_number": "101", "current_people_count": 0},
                headers=self._auth_headers(l_token),
                session=session,
            )
            room_id = r_res.json()["id"]

            # 3. Calculate invoice for 100 kWh without quota
            inv_res = self.client.post(
                f"/api/v1/rooms/{room_id}/invoices/calculate",
                json={
                    "month_year": "2026-09",
                    "elec_start": 0.0,
                    "elec_end": 100.0,
                    "water_start": 0.0,
                    "water_end": 0.0,
                    "has_registered_quota": False,
                },
                headers=self._auth_headers(l_token),
                session=session,
            )
            self.assertEqual(inv_res.status_code, 201)
            inv_data = inv_res.json()
            # 100 kWh * 3000 đ/kWh = 300.000 đ pre-tax + 8% VAT (24.000) = 324.000 đ
            self.assertEqual(inv_data["elec_amount"], 324000.0)

    def test_change_user_role_4_roles(self) -> None:
        """PUT /api/v1/admin/users/{user_id}/role supports assigning tenant, landlord, admin, root_admin."""
        with Session(self.engine) as session:
            root1, root1_tok = self._create_user(session, "root_boss1", role="root_admin")
            target_user, _ = self._create_user(session, "target_bob", role="admin")

            # 1. Change target_bob from admin to landlord
            res = self.client.put(
                f"/api/v1/admin/users/{target_user.id}/role",
                headers=self._auth_headers(root1_tok),
                json={"role": "landlord"},
                session=session,
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["role"], "landlord")
            session.refresh(target_user)
            self.assertEqual(target_user.role, "landlord")

            # 2. Change target_bob from landlord to tenant
            res = self.client.put(
                f"/api/v1/admin/users/{target_user.id}/role",
                headers=self._auth_headers(root1_tok),
                json={"role": "tenant"},
                session=session,
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["role"], "tenant")
            session.refresh(target_user)
            self.assertEqual(target_user.role, "tenant")

            # 3. Change target_bob from tenant to root_admin
            res = self.client.put(
                f"/api/v1/admin/users/{target_user.id}/role",
                headers=self._auth_headers(root1_tok),
                json={"role": "root_admin"},
                session=session,
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["role"], "root_admin")
            session.refresh(target_user)
            self.assertEqual(target_user.role, "root_admin")

            # 4. Now that 2 root admins exist, demote target_bob to admin
            res = self.client.put(
                f"/api/v1/admin/users/{target_user.id}/role",
                headers=self._auth_headers(root1_tok),
                json={"role": "admin"},
                session=session,
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()["role"], "admin")
            session.refresh(target_user)
            self.assertEqual(target_user.role, "admin")

            # 5. Attempt to demote sole root_boss1 -> fails with 400
            res = self.client.put(
                f"/api/v1/admin/users/{root1.id}/role",
                headers=self._auth_headers(root1_tok),
                json={"role": "tenant"},
                session=session,
            )
            self.assertEqual(res.status_code, 400)
            self.assertIn("Không thể hạ quyền Root Admin duy nhất của hệ thống", res.json()["detail"])


if __name__ == "__main__":
    unittest.main()
