# Copyright (c) 2026 tro. Contributors
# SPDX-License-Identifier: MIT
"""In-memory WebSocket ConnectionManager for real-time bidirectional FOSS notifications.

Maintains active WebSocket connections grouped by user_id and role, provides
targeted event delivery and global broadcasting, and operates 100% self-hosted
without external third-party cloud dependencies.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger("tro.websocket")


class ConnectionManager:
    """Manages active WebSocket connections per authenticated user and role."""

    def __init__(self) -> None:
        # Mapping: user_id -> set of active WebSocket instances
        self.active_connections: Dict[int, Set[Any]] = {}
        # Mapping: user_id -> role string ("tenant", "landlord", "admin", "root_admin")
        self.user_roles: Dict[int, str] = {}
        # Lock for thread-safe mutation
        self._lock = asyncio.Lock()

    async def connect(self, websocket: Any, user_id: int, role: str) -> None:
        """Accept incoming WebSocket connection and register user mapping."""
        try:
            await websocket.accept()
        except Exception as exc:
            logger.warning(f"Failed to accept WebSocket for user {user_id}: {exc}")
            return

        async with self._lock:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = set()
            self.active_connections[user_id].add(websocket)
            self.user_roles[user_id] = role

        logger.info(f"WebSocket connected: user_id={user_id}, role={role}, total_active={len(self.active_connections[user_id])}")

    async def disconnect(self, websocket: Any, user_id: int) -> None:
        """Unregister a disconnected WebSocket instance."""
        async with self._lock:
            if user_id in self.active_connections:
                self.active_connections[user_id].discard(websocket)
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
                    self.user_roles.pop(user_id, None)

        logger.info(f"WebSocket disconnected: user_id={user_id}")

    def update_user_role(self, user_id: int, new_role: str) -> None:
        """Update tracked role for a connected user."""
        if user_id in self.user_roles:
            self.user_roles[user_id] = new_role

    def is_user_online(self, user_id: int) -> bool:
        """Check whether at least one active connection exists for user_id."""
        return user_id in self.active_connections and len(self.active_connections[user_id]) > 0

    # ------------------------------------------------------------------------
    # Async Event Dispatchers
    # ------------------------------------------------------------------------

    async def send_to_user(
        self, user_id: int, event_type: str, data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Send structured JSON event to all active connections of a specific user."""
        sockets = list(self.active_connections.get(user_id, []))
        if not sockets:
            return

        payload = {
            "type": event_type,
            "data": data or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        text_message = json.dumps(payload, ensure_ascii=False)

        dead_sockets = []
        for ws in sockets:
            try:
                await ws.send_text(text_message)
            except Exception as exc:
                logger.debug(f"Failed to send to user {user_id}, marking dead: {exc}")
                dead_sockets.append(ws)

        if dead_sockets:
            async with self._lock:
                for ws in dead_sockets:
                    if user_id in self.active_connections:
                        self.active_connections[user_id].discard(ws)

    async def broadcast_to_role(
        self, role: str, event_type: str, data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Broadcast structured JSON event to all online users possessing a specific role."""
        target_user_ids = [uid for uid, r in self.user_roles.items() if r == role]
        for uid in target_user_ids:
            await self.send_to_user(uid, event_type, data)

    async def broadcast_to_roles(
        self, roles: List[str], event_type: str, data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Broadcast structured JSON event to all online users having one of the specified roles."""
        target_user_ids = [uid for uid, r in self.user_roles.items() if r in roles]
        for uid in target_user_ids:
            await self.send_to_user(uid, event_type, data)

    async def broadcast_all(
        self, event_type: str, data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Broadcast structured JSON event to every currently connected client."""
        target_user_ids = list(self.active_connections.keys())
        for uid in target_user_ids:
            await self.send_to_user(uid, event_type, data)

    # ------------------------------------------------------------------------
    # Synchronous Bridge Helpers (for standard synchronous endpoint handlers)
    # ------------------------------------------------------------------------

    def sync_send_to_user(
        self, user_id: int, event_type: str, data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Schedule send_to_user from a synchronous route handler without blocking."""
        self._schedule(self.send_to_user(user_id, event_type, data))

    def sync_broadcast_to_role(
        self, role: str, event_type: str, data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Schedule broadcast_to_role from a synchronous route handler without blocking."""
        self._schedule(self.broadcast_to_role(role, event_type, data))

    def sync_broadcast_to_roles(
        self, roles: List[str], event_type: str, data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Schedule broadcast_to_roles from a synchronous route handler without blocking."""
        self._schedule(self.broadcast_to_roles(roles, event_type, data))

    def sync_broadcast_all(
        self, event_type: str, data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Schedule broadcast_all from a synchronous route handler without blocking."""
        self._schedule(self.broadcast_all(event_type, data))

    def sync_broadcast(
        self, event_type: str, data: Optional[Dict[str, Any]] = None
    ) -> None:
        """Schedule broadcast_all from a synchronous route handler without blocking."""
        self._schedule(self.broadcast_all(event_type, data))

    def _schedule(self, coro: Any) -> None:
        """Safely schedule a coroutine onto the active event loop if available."""
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            try:
                # No active loop in current thread: run synchronously (e.g. unit tests)
                asyncio.run(coro)
            except Exception:
                pass


# Global singleton instance
ws_manager = ConnectionManager()
