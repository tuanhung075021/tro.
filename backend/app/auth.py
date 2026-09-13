# Copyright (c) 2026 tro. Contributors
# SPDX-License-Identifier: MIT
"""FastAPI authentication, role-based access control, and room invite code lifecycle router."""

from collections import defaultdict
import re
import secrets
import time
from typing import Dict, List, Optional
from .compat import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    OAuth2PasswordBearer,
    Session,
    select,
    status,
)
from .database import get_session, hash_admin_secret
from .models import (
    AdminApprovalRequest,
    AdminSecretKey,
    Invoice,
    MeterReading,
    Property,
    Room,
    TariffChangeLog,
    User,
    generate_invite_code,
)
from .schemas import (
    ChangePasswordIn,
    DeleteAccountIn,
    RoomOut,
    TokenResponse,
    UserLogin,
    UserOut,
    UserRegister,
)
from .security import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)
from .websocket_manager import ws_manager

USERNAME_REGEX = r"^[a-zA-Z0-9_]{3,30}$"
USERNAME_INVALID_MSG = "Tên đăng nhập chỉ được chứa ký tự chữ và số, không chứa ký tự đặc biệt"

# In-memory sliding window rate limiting buckets
_RATE_LIMIT_BUCKET: Dict[str, List[float]] = defaultdict(list)


def reset_rate_limits() -> None:
    """Clear in-memory rate limiting bucket for test isolation."""
    _RATE_LIMIT_BUCKET.clear()


def check_rate_limit(
    identifier: str,
    max_requests: int = 60,
    window_seconds: int = 60,
) -> bool:
    """Check sliding window rate limiting for IP/session identifier."""
    now = time.time()
    cutoff = now - window_seconds
    timestamps = [t for t in _RATE_LIMIT_BUCKET[identifier] if t > cutoff]
    if len(timestamps) >= max_requests:
        return False
    timestamps.append(now)
    _RATE_LIMIT_BUCKET[identifier] = timestamps
    return True


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    session: Session = Depends(get_session),
) -> User:
    """Dependency extracting and verifying the JWT token to return the current User."""
    raw_token = None
    if isinstance(token, str) and token:
        raw_token = token
    elif isinstance(authorization, str) and authorization:
        auth_str = authorization.strip()
        if auth_str.lower().startswith("bearer "):
            raw_token = auth_str[7:].strip()
        else:
            raw_token = auth_str

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(raw_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials: invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username: Optional[str] = payload.get("sub") or payload.get("username")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials: sub missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_landlord(current_user: User = Depends(get_current_user)) -> User:
    """Dependency ensuring the authenticated user has the 'landlord' role."""
    if not current_user.is_landlord:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: landlord privileges required",
        )
    return current_user


def require_tenant(current_user: User = Depends(get_current_user)) -> User:
    """Dependency ensuring the authenticated user has the 'tenant' role."""
    if not current_user.is_tenant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: tenant privileges required",
        )
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency ensuring the authenticated user has an admin role ('admin' or 'root_admin')."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yêu cầu quyền Quản trị viên",
        )
    return current_user


def require_root_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency ensuring the authenticated user has the 'root_admin' role."""
    if not current_user.is_root_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Yêu cầu quyền Root Admin",
        )
    return current_user


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(
    user_data: UserRegister,
    session: Session = Depends(get_session),
    client_ip: Optional[str] = Header(None, alias="X-Forwarded-For"),
    x_real_ip: Optional[str] = Header(None, alias="X-Real-IP"),
) -> UserOut:
    """Register a new user account (Landlord, Tenant, or Admin via Easter Egg).

    If the user is a tenant and provides a valid invite_code, they are automatically
    assigned to the corresponding room, setting its status to 'active'.
    """
    effective_ip = client_ip or x_real_ip
    if isinstance(effective_ip, str) and effective_ip.strip():
        ip_key = effective_ip.split(",")[0].strip()
        if not check_rate_limit(f"reg:{ip_key}", max_requests=20, window_seconds=60):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Quá nhiều yêu cầu đăng ký, vui lòng thử lại sau ít phút",
            )

    # Rate limiting per username to protect against single-target registration flooding
    if user_data.username:
        u_key = user_data.username.strip().lower()
        if not check_rate_limit(f"reg_user:{u_key}", max_requests=10, window_seconds=60):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Quá nhiều yêu cầu đăng ký cho tài khoản này, vui lòng thử lại sau ít phút",
            )

    raw_username = user_data.username.strip()

    if "::" in raw_username:
        clean_username, _, submitted_key = raw_username.partition("::")
        clean_username = clean_username.strip()
        submitted_key = submitted_key.strip()

        active_key = session.exec(
            select(AdminSecretKey)
            .where(AdminSecretKey.is_active == True)
            .order_by(AdminSecretKey.id.desc())
        ).first()

        key_valid = False
        if active_key is not None and submitted_key:
            try:
                candidate_hash = hash_admin_secret(submitted_key)
                if secrets.compare_digest(candidate_hash, active_key.hashed_secret):
                    key_valid = True
            except Exception:
                key_valid = False

        if key_valid:
            if not re.match(USERNAME_REGEX, clean_username):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=USERNAME_INVALID_MSG,
                )

            existing = session.exec(select(User).where(User.username == clean_username)).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Tên đăng nhập đã tồn tại, vui lòng chọn tên khác (Username '{clean_username}' is already registered)",
                )

            admins = session.exec(select(User).where(User.role.in_(["admin", "root_admin"]))).all()
            assigned_role = "root_admin" if len(admins) == 0 else "pending_admin"

            hashed_password = get_password_hash(user_data.password)
            user = User(
                username=clean_username,
                hashed_password=hashed_password,
                full_name=user_data.full_name,
                phone=user_data.phone,
                role=assigned_role,
            )
            try:
                session.add(user)
                session.commit()
                session.refresh(user)

                if assigned_role == "pending_admin":
                    approval_req = AdminApprovalRequest(
                        user_id=user.id,
                        secret_key_id=active_key.id,
                        status="pending",
                    )
                    session.add(approval_req)
                    session.commit()
                    ws_manager.sync_broadcast_to_role(
                        "root_admin",
                        "NEW_ADMIN_REQUEST",
                        {
                            "id": approval_req.id,
                            "user_id": user.id,
                            "username": user.username,
                            "full_name": user.full_name,
                        },
                    )
            except Exception:
                session.rollback()
                raise

            return UserOut.model_validate(user)
        else:
            # Conceal key existence: treat entire raw_username as standard username
            if not re.match(USERNAME_REGEX, raw_username):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=USERNAME_INVALID_MSG,
                )
            existing = session.exec(select(User).where(User.username == raw_username)).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Tên đăng nhập đã tồn tại, vui lòng chọn tên khác (Username '{raw_username}' is already registered)",
                )

    # Standard registration path
    if not re.match(USERNAME_REGEX, raw_username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=USERNAME_INVALID_MSG,
        )

    existing = session.exec(select(User).where(User.username == raw_username)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tên đăng nhập đã tồn tại, vui lòng chọn tên khác (Username '{raw_username}' is already registered)",
        )

    # If tenant with invite code, validate room existence and occupancy upfront
    room: Optional[Room] = None
    cleaned_code = user_data.invite_code.strip() if user_data.invite_code else None
    if user_data.role == "tenant" and cleaned_code:
        room = session.exec(select(Room).where(Room.invite_code == cleaned_code)).first()
        if not room:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Invalid invite code: '{cleaned_code}'. Room not found.",
            )
        if room.tenant_id is not None or room.status == "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Room with invite code '{cleaned_code}' is already occupied.",
            )

    # Hash password and persist user
    hashed_password = get_password_hash(user_data.password)
    user = User(
        username=raw_username,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        phone=user_data.phone,
        role=user_data.role,
    )
    try:
        session.add(user)
        session.commit()
        session.refresh(user)

        # Link tenant to room if invite code was validated
        if room is not None:
            room.assign_tenant(user.id)
            session.add(room)
            session.commit()
            session.refresh(room)
            prop = session.get(Property, room.property_id)
            if prop:
                ws_manager.sync_send_to_user(
                    prop.landlord_id,
                    "TENANT_JOINED",
                    {
                        "room_id": room.id,
                        "room_number": room.room_number,
                        "tenant_id": user.id,
                        "tenant_name": user.full_name or user.username,
                    },
                )
    except Exception:
        session.rollback()
        raise

    return UserOut.model_validate(user)


@router.post("/login", response_model=TokenResponse)
def login(
    login_data: UserLogin,
    session: Session = Depends(get_session),
    client_ip: Optional[str] = Header(None, alias="X-Forwarded-For"),
    x_real_ip: Optional[str] = Header(None, alias="X-Real-IP"),
) -> TokenResponse:
    """Authenticate user credentials and issue a JWT access token."""
    effective_ip = client_ip or x_real_ip
    if isinstance(effective_ip, str) and effective_ip.strip():
        ip_key = effective_ip.split(",")[0].strip()
        if not check_rate_limit(f"login:{ip_key}", max_requests=30, window_seconds=60):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Quá nhiều yêu cầu đăng nhập, vui lòng thử lại sau ít phút",
            )

    # Protect against brute-forcing passwords for a specific user
    if login_data.username:
        u_key = login_data.username.strip().lower()
        if not check_rate_limit(f"login_user:{u_key}", max_requests=20, window_seconds=60):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Quá nhiều yêu cầu đăng nhập cho tài khoản này, vui lòng thử lại sau ít phút",
            )

    user = session.exec(select(User).where(User.username == login_data.username)).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id, "role": user.role}
    )
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.id,
        username=user.username,
        role=user.role,
        full_name=user.full_name,
    )


@router.get("/me", response_model=UserOut)
def get_me(
    current_user: User = Depends(get_current_user),
) -> UserOut:
    """Return profile details for the currently authenticated user."""
    return UserOut.model_validate(current_user)


@router.post("/change-password")
def change_password(
    pwd_data: ChangePasswordIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Allow any authenticated user to change their password by validating their current password."""
    if not verify_password(pwd_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu hiện tại không chính xác",
        )
    if pwd_data.new_password != pwd_data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu xác nhận không khớp với mật khẩu mới",
        )
    if len(pwd_data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới phải có tối thiểu 6 ký tự",
        )
    if pwd_data.new_password == pwd_data.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới không được trùng với mật khẩu hiện tại",
        )
    current_user.hashed_password = get_password_hash(pwd_data.new_password)
    session.add(current_user)
    session.commit()
    return {"message": "Đổi mật khẩu thành công"}


@router.post("/rooms/{room_id}/remove-tenant", response_model=RoomOut)
def remove_tenant_from_room(
    room_id: int,
    current_user: User = Depends(require_landlord),
    session: Session = Depends(get_session),
) -> RoomOut:
    """Landlord-only endpoint to remove a tenant from a room, set status to 'empty',
    and regenerate the room invite_code for subsequent tenants.
    """
    require_landlord(current_user)
    room = session.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )

    prop: Optional[Property] = None
    landlord_name: Optional[str] = None
    landlord_phone: Optional[str] = None

    # If room is part of a property, verify landlord ownership
    if room.property_id is not None:
        prop = session.get(Property, room.property_id)
        if prop is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Property with id {room.property_id} not found",
            )
        if prop.landlord_id is not None and prop.landlord_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to manage rooms in this property",
            )
        if prop.landlord_id is not None:
            landlord = session.get(User, prop.landlord_id)
            if landlord:
                landlord_name = landlord.full_name or landlord.username
                landlord_phone = landlord.phone

    room.remove_tenant()
    session.add(room)
    session.commit()
    session.refresh(room)
    return RoomOut(
        id=room.id,
        room_number=room.room_number,
        property_id=room.property_id,
        invite_code=room.invite_code,
        status=room.status,
        current_people_count=room.current_people_count,
        tenant_id=room.tenant_id,
        tenant_name=None,
        tenant_phone=None,
        property_name=prop.name if prop else None,
        property_address=prop.address if prop else None,
        landlord_name=landlord_name,
        landlord_phone=landlord_phone,
    )


@router.delete("/account")
@router.post("/delete-account")
def delete_account(
    payload: DeleteAccountIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """Permanently delete an authenticated user account with password verification and database integrity safeguards.

    Safety measures & cascade behavior:
    1. Authenticate user password.
    2. Root Admin check: Disallow deleting the sole Root Admin in the system.
    3. Admin audit transfer: Reassign TariffChangeLog records to the remaining Root Admin.
    4. Landlord cascade: Block deletion if active tenants exist. Cascade delete properties, rooms,
       readings, and invoices if all rooms are vacant.
    5. Tenant room release: Vacate all occupied rooms and regenerate invite codes.
    6. Admin requests cleanup: Remove own requests and reassign reviewed requests.
    7. Hard delete user record and commit.
    """
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu xác nhận không chính xác",
        )

    # 1. Protection for Root Admin
    target_root_admin: Optional[User] = None
    if current_user.is_root_admin:
        all_root_admins = session.exec(
            select(User).where(User.role == "root_admin")
        ).all()
        other_root_admins = [u for u in all_root_admins if u.id != current_user.id]
        if not other_root_admins:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể xóa tài khoản Root Admin duy nhất của hệ thống",
            )
        target_root_admin = other_root_admins[0]
    else:
        target_root_admin = session.exec(
            select(User).where(User.role == "root_admin", User.id != current_user.id)
        ).first()

    # 2. Reassign TariffChangeLog for Admin / Root Admin to preserve audit trails
    if current_user.is_admin:
        change_logs = session.exec(
            select(TariffChangeLog).where(TariffChangeLog.changed_by_id == current_user.id)
        ).all()
        if change_logs:
            if not target_root_admin:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Không tìm thấy Root Admin kế nhiệm để tiếp nhận nhật ký kiểm toán biểu giá",
                )
            for log in change_logs:
                log.changed_by_id = target_root_admin.id
                log.note = f"[Chuyển giao từ @{current_user.username}] {log.note or ''}".strip()
                session.add(log)

    # 3. Handle Landlord properties & rooms
    user_properties = session.exec(
        select(Property).where(Property.landlord_id == current_user.id)
    ).all()
    if user_properties:
        prop_ids = [p.id for p in user_properties if p.id is not None]
        if prop_ids:
            all_rooms = session.exec(
                select(Room).where(Room.property_id.in_(prop_ids))
            ).all()
            # Check if any room has an active tenant
            active_tenants = [r for r in all_rooms if r.tenant_id is not None]
            if active_tenants:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Không thể xóa tài khoản: Vẫn còn {len(active_tenants)} phòng đang có người thuê. "
                        "Vui lòng trả phòng cho tất cả người thuê trước khi xóa tài khoản."
                    ),
                )
            room_ids = [r.id for r in all_rooms if r.id is not None]
            if room_ids:
                # Delete Invoices belonging to these rooms
                invoices = session.exec(
                    select(Invoice).where(Invoice.room_id.in_(room_ids))
                ).all()
                for inv in invoices:
                    session.delete(inv)

                # Delete MeterReadings belonging to these rooms
                readings = session.exec(
                    select(MeterReading).where(MeterReading.room_id.in_(room_ids))
                ).all()
                for mr in readings:
                    session.delete(mr)

                # Delete Rooms
                for r in all_rooms:
                    session.delete(r)

            # Delete Properties
            for p in user_properties:
                session.delete(p)

    # 4. Handle Tenant room assignments
    tenant_rooms = session.exec(
        select(Room).where(Room.tenant_id == current_user.id)
    ).all()
    for tr in tenant_rooms:
        tr.remove_tenant()
        session.add(tr)

    # 5. Handle AdminApprovalRequest references
    # Requests created by this user
    user_requests = session.exec(
        select(AdminApprovalRequest).where(AdminApprovalRequest.user_id == current_user.id)
    ).all()
    for req in user_requests:
        session.delete(req)

    # Requests reviewed by this user
    reviewed_requests = session.exec(
        select(AdminApprovalRequest).where(AdminApprovalRequest.reviewed_by_id == current_user.id)
    ).all()
    for req in reviewed_requests:
        req.reviewed_by_id = target_root_admin.id if target_root_admin else None
        session.add(req)

    # AdminSecretKeys created by this user
    created_keys = session.exec(
        select(AdminSecretKey).where(AdminSecretKey.created_by_id == current_user.id)
    ).all()
    for sk in created_keys:
        sk.created_by_id = target_root_admin.id if target_root_admin else None
        session.add(sk)

    # 6. Delete the user
    session.delete(current_user)
    session.commit()

    return {"message": "Tài khoản của bạn đã được xóa thành công"}
