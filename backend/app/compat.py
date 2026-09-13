# Copyright (c) 2026 tro. Contributors
# SPDX-License-Identifier: MIT
"""Compatibility layer providing SQLModel interface with SQLite fallback.

If sqlmodel is installed, standard sqlmodel exports are re-exported.
If not, a lightweight Pydantic v2 + sqlite3 engine is provided with identical API.
"""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
import sys
import types
from typing import Any, Callable, ClassVar, Dict, Generator, List, Optional, Set, Tuple, Type, Union, get_args, get_origin
import pydantic
from pydantic import BaseModel, ConfigDict
from pydantic.fields import FieldInfo
from pydantic_core import PydanticUndefined

USE_NATIVE_SQLMODEL = os.environ.get("USE_NATIVE_SQLMODEL", "0") == "1"

if USE_NATIVE_SQLMODEL:
    try:
        import sqlmodel
        from sqlmodel import SQLModel, Field, Session, create_engine, select, col
        SQLMODEL_INSTALLED = True
    except ImportError:
        SQLMODEL_INSTALLED = False
else:
    SQLMODEL_INSTALLED = False

if not SQLMODEL_INSTALLED:

    _TABLE_REGISTRY: Dict[str, Type["SQLModel"]] = {}

    class ColumnOrdering:
        """Represents column ordering (ASC or DESC)."""
        def __init__(self, col: str, is_desc: bool = False):
            self.col = col
            self.is_desc = is_desc

    class BinaryCondition:
        """Represents a SQL comparison condition."""
        def __init__(self, col: str, op: str, value: Any):
            self.col = col
            self.op = op
            self.value = value

        def __and__(self, other: Any) -> "CompoundCondition":
            return CompoundCondition("AND", [self, other])

        def __or__(self, other: Any) -> "CompoundCondition":
            return CompoundCondition("OR", [self, other])

    class CompoundCondition:
        """Represents logical conjunction (AND / OR) of conditions."""
        def __init__(self, op: str, conditions: List[Any]):
            self.op = op
            self.conditions = conditions

        def __and__(self, other: Any) -> "CompoundCondition":
            return CompoundCondition("AND", [self, other])

        def __or__(self, other: Any) -> "CompoundCondition":
            return CompoundCondition("OR", [self, other])

    class ColumnAttribute:
        """Column proxy returned during class attribute access for query building."""
        def __init__(self, name: str, field_info: Any):
            self.name = name
            self.field_info = field_info

        def __eq__(self, other: Any) -> BinaryCondition:  # type: ignore[override]
            return BinaryCondition(self.name, "=", other)

        def __ne__(self, other: Any) -> BinaryCondition:  # type: ignore[override]
            return BinaryCondition(self.name, "!=", other)

        def __lt__(self, other: Any) -> BinaryCondition:
            return BinaryCondition(self.name, "<", other)

        def __le__(self, other: Any) -> BinaryCondition:
            return BinaryCondition(self.name, "<=", other)

        def __gt__(self, other: Any) -> BinaryCondition:
            return BinaryCondition(self.name, ">", other)

        def __ge__(self, other: Any) -> BinaryCondition:
            return BinaryCondition(self.name, ">=", other)

        def in_(self, values: Any) -> BinaryCondition:
            return BinaryCondition(self.name, "IN", list(values))

        def not_in(self, values: Any) -> BinaryCondition:
            return BinaryCondition(self.name, "NOT IN", list(values))

        def like(self, pattern: str) -> BinaryCondition:
            return BinaryCondition(self.name, "LIKE", pattern)

        def is_(self, other: Any) -> BinaryCondition:
            return BinaryCondition(self.name, "=", other)

        def is_not(self, other: Any) -> BinaryCondition:
            return BinaryCondition(self.name, "!=", other)

        def desc(self) -> ColumnOrdering:
            return ColumnOrdering(self.name, is_desc=True)

        def asc(self) -> ColumnOrdering:
            return ColumnOrdering(self.name, is_desc=False)

    def col(attribute: Any) -> Any:
        return attribute

    class SQLModelMetaclass(type(BaseModel)):
        """Metaclass intercepting class-level column access for query expressions."""
        def __getattr__(cls, name: str) -> Any:
            if name.startswith("_") or name in ("metadata", "model_config", "model_fields"):
                raise AttributeError(f"type object '{cls.__name__}' has no attribute '{name}'")
            fields = cls.__dict__.get("__pydantic_fields__")
            if fields is None:
                for base in cls.__mro__:
                    if "__pydantic_fields__" in base.__dict__:
                        fields = base.__dict__["__pydantic_fields__"]
                        break
            if fields and name in fields:
                return ColumnAttribute(name, fields[name])
            raise AttributeError(f"type object '{cls.__name__}' has no attribute '{name}'")

    def _get_field_meta(field_info: Any, key: str, default: Any = None) -> Any:
        """Extract metadata from FieldInfo or its json_schema_extra."""
        if hasattr(field_info, key):
            return getattr(field_info, key)
        extra = getattr(field_info, "json_schema_extra", None)
        if isinstance(extra, dict):
            return extra.get(key, default)
        return default

    def Field(
        default: Any = PydanticUndefined,
        *,
        default_factory: Optional[Callable[[], Any]] = None,
        primary_key: bool = False,
        foreign_key: Optional[str] = None,
        unique: bool = False,
        index: bool = False,
        **kwargs: Any,
    ) -> Any:
        """SQLModel-compatible Field with database column metadata."""
        extra = kwargs.pop("json_schema_extra", {})
        if not isinstance(extra, dict):
            extra = {}
        extra.update({
            "primary_key": primary_key,
            "foreign_key": foreign_key,
            "unique": unique,
            "index": index,
        })
        if default_factory is not None:
            return pydantic.Field(default_factory=default_factory, json_schema_extra=extra, **kwargs)
        elif default is not PydanticUndefined:
            return pydantic.Field(default=default, json_schema_extra=extra, **kwargs)
        else:
            return pydantic.Field(json_schema_extra=extra, **kwargs)

    class Metadata:
        """Table schema generator and executor for SQLite."""
        def create_all(self, engine: "Engine") -> None:
            conn = engine.get_connection()
            cursor = conn.cursor()
            for tablename, model_cls in _TABLE_REGISTRY.items():
                cols: List[str] = []
                fk_clauses: List[str] = []

                for fname, finfo in model_cls.model_fields.items():
                    is_pk = _get_field_meta(finfo, "primary_key", False)
                    sql_type = _python_type_to_sqlite(finfo.annotation)
                    col_def = f"{fname} {sql_type}"

                    if is_pk:
                        col_def += " PRIMARY KEY"
                        if sql_type == "INTEGER":
                            col_def += " AUTOINCREMENT"
                    elif _get_field_meta(finfo, "unique", False):
                        col_def += " UNIQUE"
                    cols.append(col_def)

                    fk = _get_field_meta(finfo, "foreign_key", None)
                    if fk:
                        target_table, target_col = fk.split(".")
                        fk_clauses.append(f"FOREIGN KEY ({fname}) REFERENCES {target_table}({target_col})")

                all_defs = cols + fk_clauses
                sql = f"CREATE TABLE IF NOT EXISTS {tablename} (\n  " + ",\n  ".join(all_defs) + "\n);"
                cursor.execute(sql)

                # Auto-migrate: check if table already exists, and if any model columns are missing, add them
                cursor.execute(f"PRAGMA table_info({tablename});")
                existing_cols = {row[1] for row in cursor.fetchall()}
                for fname, finfo in model_cls.model_fields.items():
                    if fname not in existing_cols:
                        sql_type = _python_type_to_sqlite(finfo.annotation)
                        cursor.execute(f'ALTER TABLE {tablename} ADD COLUMN "{fname}" {sql_type};')

                for fname, finfo in model_cls.model_fields.items():
                    if _get_field_meta(finfo, "index", False) and not _get_field_meta(finfo, "primary_key", False):
                        idx_sql = f"CREATE INDEX IF NOT EXISTS idx_{tablename}_{fname} ON {tablename} ({fname});"
                        cursor.execute(idx_sql)

            conn.commit()
            if engine._shared_conn is None:
                conn.close()

    class SQLModel(BaseModel, metaclass=SQLModelMetaclass):
        """Base SQLModel supporting Pydantic validation and SQLite table mapping."""
        model_config = ConfigDict(from_attributes=True, arbitrary_types_allowed=True)
        metadata: ClassVar[Metadata] = Metadata()

        @classmethod
        def __init_subclass__(cls, table: bool = False, **kwargs: Any) -> None:
            super().__init_subclass__(**kwargs)
            cls.__is_table__ = table
            if table:
                if not hasattr(cls, "__tablename__"):
                    cls.__tablename__ = cls.__name__.lower()
                _TABLE_REGISTRY[cls.__tablename__] = cls

    def _python_type_to_sqlite(ann: Any) -> str:
        origin = get_origin(ann)
        is_union = origin is Union or (hasattr(types, "UnionType") and origin is types.UnionType)
        if is_union:
            args = [a for a in get_args(ann) if a is not type(None)]
            if args:
                ann = args[0]
        if ann in (int,):
            return "INTEGER"
        if ann in (float,):
            return "REAL"
        if ann in (bool,):
            return "INTEGER"
        return "TEXT"

    class Select:
        """Select query builder."""
        def __init__(self, model_cls: Type[SQLModel]):
            self.model_cls = model_cls
            self.conditions: List[Any] = []
            self.order_bys: List[Any] = []
            self._limit: Optional[int] = None
            self._offset: Optional[int] = None

        def where(self, *conditions: Any) -> "Select":
            self.conditions.extend(conditions)
            return self

        def order_by(self, *cols: Any) -> "Select":
            self.order_bys.extend(cols)
            return self

        def limit(self, limit: int) -> "Select":
            self._limit = limit
            return self

        def offset(self, offset: int) -> "Select":
            self._offset = offset
            return self

    def select(model_cls: Type[SQLModel]) -> Select:
        return Select(model_cls)

    class ExecResult:
        """Query execution result wrapper."""
        def __init__(self, items: List[Any]):
            self._items = items

        def all(self) -> List[Any]:
            return list(self._items)

        def first(self) -> Optional[Any]:
            return self._items[0] if self._items else None

        def one_or_none(self) -> Optional[Any]:
            if not self._items:
                return None
            if len(self._items) > 1:
                raise ValueError("Multiple rows were found when one or none was expected")
            return self._items[0]

        def __iter__(self):
            return iter(self._items)

        def __len__(self):
            return len(self._items)

    class Engine:
        """Database connection provider."""
        def __init__(self, url: str, echo: bool = False, connect_args: Optional[Dict[str, Any]] = None):
            self.url = url
            self.echo = echo
            self.connect_args = connect_args or {}

            if url.startswith("sqlite:///"):
                self.db_path = url[len("sqlite:///"):]
            elif url == "sqlite://" or url == "sqlite:///:memory:":
                self.db_path = ":memory:"
            else:
                self.db_path = url

            self._shared_conn: Optional[sqlite3.Connection] = None
            if self.db_path == ":memory:":
                self._shared_conn = sqlite3.connect(":memory:", check_same_thread=False)
                self._shared_conn.row_factory = sqlite3.Row

        def get_connection(self) -> sqlite3.Connection:
            if self._shared_conn is not None:
                return self._shared_conn
            conn = sqlite3.connect(
                self.db_path,
                check_same_thread=self.connect_args.get("check_same_thread", True)
            )
            conn.row_factory = sqlite3.Row
            try:
                conn.execute("PRAGMA foreign_keys = ON;")
            except Exception:
                pass
            return conn

    def create_engine(url: str, echo: bool = False, connect_args: Optional[Dict[str, Any]] = None) -> Engine:
        return Engine(url, echo=echo, connect_args=connect_args)

    class Session:
        """Database session executing operations against SQLite."""
        def __init__(self, engine: Engine):
            self.engine = engine
            self.conn = engine.get_connection()
            self._new_objects: List[Any] = []
            self._deleted_objects: List[Any] = []
            self._is_active = True

        def __enter__(self) -> "Session":
            return self

        def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
            if exc_type is not None:
                self.rollback()
            self.close()

        def add(self, obj: Any) -> None:
            if obj in self._deleted_objects:
                self._deleted_objects.remove(obj)
            if obj not in self._new_objects:
                self._new_objects.append(obj)

        def delete(self, obj: Any) -> None:
            if obj in self._new_objects:
                self._new_objects.remove(obj)
            if obj not in self._deleted_objects:
                self._deleted_objects.append(obj)

        def commit(self) -> None:
            cursor = self.conn.cursor()

            # Handle adds / updates first (so foreign key updates/unlinks are applied before deletes)
            for obj in self._new_objects:
                if obj in self._deleted_objects:
                    continue
                tablename = obj.__tablename__
                pk_col = _get_primary_key(obj.__class__)
                pk_val = getattr(obj, pk_col, None)

                data: Dict[str, Any] = {}
                for fname in obj.__class__.model_fields.keys():
                    val = getattr(obj, fname, None)
                    if isinstance(val, datetime):
                        val = val.isoformat()
                    elif isinstance(val, bool):
                        val = 1 if val else 0
                    data[fname] = val

                exists = False
                if pk_val is not None:
                    cursor.execute(f'SELECT 1 FROM "{tablename}" WHERE "{pk_col}" = ?', (pk_val,))
                    exists = cursor.fetchone() is not None

                if exists:
                    update_cols = [f'"{k}" = ?' for k in data.keys() if k != pk_col]
                    params = [data[k] for k in data.keys() if k != pk_col] + [pk_val]
                    if update_cols:
                        cursor.execute(f'UPDATE "{tablename}" SET {", ".join(update_cols)} WHERE "{pk_col}" = ?', params)
                else:
                    if pk_val is None:
                        insert_data = {k: v for k, v in data.items() if k != pk_col}
                    else:
                        insert_data = data
                    cols = list(insert_data.keys())
                    placeholders = ["?"] * len(cols)
                    quoted_cols = [f'"{c}"' for c in cols]
                    params = [insert_data[c] for c in cols]
                    sql = f'INSERT INTO "{tablename}" ({", ".join(quoted_cols)}) VALUES ({", ".join(placeholders)})'
                    cursor.execute(sql, params)
                    if pk_val is None and pk_col:
                        setattr(obj, pk_col, cursor.lastrowid)

            self._new_objects.clear()

            # Handle deletes
            for obj in self._deleted_objects:
                tablename = obj.__tablename__
                pk_col = _get_primary_key(obj.__class__)
                pk_val = getattr(obj, pk_col, None)
                if pk_val is not None:
                    cursor.execute(f'DELETE FROM "{tablename}" WHERE "{pk_col}" = ?', (pk_val,))
            self._deleted_objects.clear()

            self.conn.commit()

        def rollback(self) -> None:
            self.conn.rollback()
            self._new_objects.clear()
            self._deleted_objects.clear()

        def close(self) -> None:
            if self._is_active:
                self._is_active = False
                if self.engine._shared_conn is None:
                    self.conn.close()

        def refresh(self, obj: Any) -> None:
            tablename = obj.__tablename__
            pk_col = _get_primary_key(obj.__class__)
            pk_val = getattr(obj, pk_col, None)
            if pk_val is not None:
                cursor = self.conn.cursor()
                cursor.execute(f'SELECT * FROM "{tablename}" WHERE "{pk_col}" = ?', (pk_val,))
                row = cursor.fetchone()
                if row:
                    for k in row.keys():
                        val = _deserialize_val(obj.__class__, k, row[k])
                        setattr(obj, k, val)

        def get(self, model_cls: Type[SQLModel], pk_val: Any) -> Optional[Any]:
            pk_col = _get_primary_key(model_cls)
            for obj in self._deleted_objects:
                if isinstance(obj, model_cls) and getattr(obj, pk_col, None) == pk_val:
                    return None
            for obj in self._new_objects:
                if isinstance(obj, model_cls) and getattr(obj, pk_col, None) == pk_val:
                    return obj
            tablename = model_cls.__tablename__
            cursor = self.conn.cursor()
            cursor.execute(f'SELECT * FROM "{tablename}" WHERE "{pk_col}" = ?', (pk_val,))
            row = cursor.fetchone()
            if not row:
                return None
            return _instantiate_model(model_cls, row)

        def exec(self, select_stmt: Select) -> ExecResult:
            model_cls = select_stmt.model_cls
            tablename = model_cls.__tablename__

            sql = f'SELECT * FROM "{tablename}"'
            params: List[Any] = []

            def _render_condition(cond: Any) -> str:
                if isinstance(cond, CompoundCondition):
                    rendered = [_render_condition(c) for c in cond.conditions]
                    return f"({f' {cond.op} '.join(rendered)})"
                if isinstance(cond, BinaryCondition):
                    col_name = f'"{cond.col}"'
                    if cond.value is None:
                        if cond.op in ("=", "IS"):
                            return f"{col_name} IS NULL"
                        elif cond.op in ("!=", "<>", "IS NOT"):
                            return f"{col_name} IS NOT NULL"
                    if cond.op in ("IN", "NOT IN"):
                        vals = list(cond.value)
                        if not vals:
                            return "1=0" if cond.op == "IN" else "1=1"
                        placeholders = ",".join(["?"] * len(vals))
                        params.extend(vals)
                        return f"{col_name} {cond.op} ({placeholders})"
                    params.append(cond.value)
                    return f"{col_name} {cond.op} ?"
                return str(cond)

            if select_stmt.conditions:
                cond_clauses = [_render_condition(cond) for cond in select_stmt.conditions]
                sql += " WHERE " + " AND ".join(cond_clauses)

            if select_stmt.order_bys:
                order_clauses = []
                for o in select_stmt.order_bys:
                    if isinstance(o, ColumnOrdering):
                        direction = "DESC" if o.is_desc else "ASC"
                        order_clauses.append(f'"{o.col}" {direction}')
                    elif isinstance(o, ColumnAttribute):
                        order_clauses.append(f'"{o.name}" ASC')
                    elif isinstance(o, str):
                        order_clauses.append(o)
                if order_clauses:
                    sql += " ORDER BY " + ", ".join(order_clauses)

            if select_stmt._limit is not None:
                sql += f" LIMIT {int(select_stmt._limit)}"
            if select_stmt._offset is not None:
                sql += f" OFFSET {int(select_stmt._offset)}"

            cursor = self.conn.cursor()
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            items = [_instantiate_model(model_cls, r) for r in rows]
            return ExecResult(items)

    def _get_primary_key(model_cls: Type[SQLModel]) -> str:
        for fname, finfo in model_cls.model_fields.items():
            if _get_field_meta(finfo, "primary_key", False):
                return fname
        return "id"

    def _deserialize_val(model_cls: Type[SQLModel], field_name: str, raw_val: Any) -> Any:
        if raw_val is None:
            return None
        field_info = model_cls.model_fields.get(field_name)
        if not field_info:
            return raw_val
        ann = field_info.annotation
        origin = get_origin(ann)
        is_union = origin is Union or (hasattr(types, "UnionType") and origin is types.UnionType)
        if is_union:
            args = [a for a in get_args(ann) if a is not type(None)]
            if args:
                ann = args[0]
        if ann is datetime and isinstance(raw_val, str):
            return datetime.fromisoformat(raw_val)
        if ann is bool and isinstance(raw_val, int):
            return bool(raw_val)
        return raw_val

    def _instantiate_model(model_cls: Type[SQLModel], row: sqlite3.Row) -> Any:
        d = {}
        for k in row.keys():
            val = _deserialize_val(model_cls, k, row[k])
            if val is None:
                field_info = model_cls.model_fields.get(k)
                if field_info is not None:
                    ann = field_info.annotation
                    origin = get_origin(ann)
                    is_union = origin is Union or (hasattr(types, "UnionType") and origin is types.UnionType)
                    accepts_none = is_union and type(None) in get_args(ann)
                    # If field does not accept None or defines a non-None default, omit None so model defaults apply
                    if not accepts_none or (field_info.default is not None and str(field_info.default) != "PydanticUndefined"):
                        continue
            d[k] = val
        return model_cls(**d)

    # Register virtual sqlmodel module in sys.modules so standard imports work everywhere
    mod = types.ModuleType("sqlmodel")
    mod.SQLModel = SQLModel
    mod.Field = Field
    mod.Session = Session
    mod.create_engine = create_engine
    mod.select = select
    mod.col = col
    sys.modules["sqlmodel"] = mod


# ============================================================================
# FastAPI Compatibility Layer
# ============================================================================

try:
    import fastapi
    from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request, Response, status, WebSocket, WebSocketDisconnect
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordBearer
    FASTAPI_INSTALLED = True
    try:
        from fastapi.middleware.cors import CORSMiddleware
    except ImportError:
        class CORSMiddleware:  # type: ignore[no-redef]
            def __init__(self, app: Any = None, **kwargs: Any):
                self.app = app
                self.kwargs = kwargs
    try:
        from fastapi.responses import FileResponse, HTMLResponse
    except ImportError:
        try:
            from starlette.responses import FileResponse, HTMLResponse  # type: ignore
        except ImportError:
            FileResponse = None  # type: ignore
            HTMLResponse = None  # type: ignore
    try:
        from fastapi.staticfiles import StaticFiles
    except ImportError:
        try:
            from starlette.staticfiles import StaticFiles  # type: ignore
        except ImportError:
            StaticFiles = None  # type: ignore
except ImportError:
    FASTAPI_INSTALLED = False
    Response = None  # type: ignore
    FileResponse = None  # type: ignore
    HTMLResponse = None  # type: ignore
    StaticFiles = None  # type: ignore

    class WebSocket:  # type: ignore[no-redef]
        """Lightweight WebSocket mock for compatibility."""
        async def accept(self) -> None:
            pass
        async def send_text(self, data: str) -> None:
            pass
        async def send_json(self, data: Any) -> None:
            pass
        async def receive_text(self) -> str:
            return ""
        async def close(self, code: int = 1000) -> None:
            pass

    class WebSocketDisconnect(Exception):  # type: ignore[no-redef]
        def __init__(self, code: int = 1000):
            self.code = code

    class Request:  # type: ignore[no-redef]
        """Lightweight Request mock for compatibility."""
        def __init__(self, headers: Optional[Dict[str, str]] = None, client: Optional[Any] = None):
            self.headers = headers or {}
            self.client = client

if FASTAPI_INSTALLED:
    class _ParamInfo:
        pass
    class _HeaderInfo(_ParamInfo):
        pass
    class _QueryInfo(_ParamInfo):
        pass

if not FASTAPI_INSTALLED or Response is None:
    class Response:  # type: ignore[no-redef]
        """Base HTTP response."""
        def __init__(
            self,
            content: Any = b"",
            status_code: int = 200,
            headers: Optional[Dict[str, str]] = None,
            media_type: Optional[str] = None,
        ):
            self.content = content
            self.status_code = status_code
            self.headers = headers or {}
            self.media_type = media_type

        @property
        def body(self) -> bytes:
            if isinstance(self.content, bytes):
                return self.content
            if isinstance(self.content, str):
                return self.content.encode("utf-8")
            return str(self.content).encode("utf-8")

if not FASTAPI_INSTALLED or HTMLResponse is None:
    class HTMLResponse(Response):  # type: ignore[no-redef]
        """HTML HTTP response."""
        def __init__(
            self,
            content: Any = "",
            status_code: int = 200,
            headers: Optional[Dict[str, str]] = None,
        ):
            hdrs = dict(headers or {})
            if not any(k.lower() == "content-type" for k in hdrs):
                hdrs["content-type"] = "text/html; charset=utf-8"
            super().__init__(content=content, status_code=status_code, headers=hdrs, media_type="text/html")

if not FASTAPI_INSTALLED or FileResponse is None:
    class FileResponse(Response):  # type: ignore[no-redef]
        """File HTTP response."""
        def __init__(
            self,
            path: Union[str, Path],
            status_code: int = 200,
            headers: Optional[Dict[str, str]] = None,
            media_type: Optional[str] = None,
        ):
            self.path = Path(path)
            if media_type is None:
                import mimetypes
                guessed, _ = mimetypes.guess_type(str(self.path))
                media_type = guessed or "application/octet-stream"
            hdrs = dict(headers or {})
            if not any(k.lower() == "content-type" for k in hdrs):
                hdrs["content-type"] = media_type
            content = self.path.read_bytes() if self.path.is_file() else b""
            super().__init__(content=content, status_code=status_code, headers=hdrs, media_type=media_type)

if not FASTAPI_INSTALLED or StaticFiles is None:
    class StaticFiles:  # type: ignore[no-redef]
        """StaticFiles ASGI-compatible shim."""
        def __init__(self, directory: Union[str, Path], html: bool = False, **kwargs: Any):
            self.directory = Path(directory)
            self.html = html
            self.kwargs = kwargs

        def get_response(self, path: str) -> Optional[Response]:
            target = (self.directory / path.lstrip("/")).resolve()
            try:
                target.relative_to(self.directory.resolve())
            except (ValueError, RuntimeError):
                return None
            if target.is_file():
                return FileResponse(str(target))
            return None

if not FASTAPI_INSTALLED:
    class CORSMiddleware:
        """CORSMiddleware placeholder."""
        def __init__(self, app: Any = None, **kwargs: Any):
            self.app = app
            self.kwargs = kwargs

    class HTTPException(Exception):
        """HTTP exception carrying status code, message detail, and headers."""
        def __init__(
            self,
            status_code: int,
            detail: Any = None,
            headers: Optional[Dict[str, str]] = None,
        ):
            self.status_code = status_code
            self.detail = detail
            self.headers = headers or {}
            super().__init__(f"{status_code}: {detail}")

    class _HttpStatus:
        """Standard HTTP status codes matching FastAPI status definitions."""
        HTTP_200_OK = 200
        HTTP_201_CREATED = 201
        HTTP_202_ACCEPTED = 202
        HTTP_204_NO_CONTENT = 204
        HTTP_400_BAD_REQUEST = 400
        HTTP_401_UNAUTHORIZED = 401
        HTTP_403_FORBIDDEN = 403
        HTTP_404_NOT_FOUND = 404
        HTTP_405_METHOD_NOT_ALLOWED = 405
        HTTP_409_CONFLICT = 409
        HTTP_422_UNPROCESSABLE_ENTITY = 422
        HTTP_429_TOO_MANY_REQUESTS = 429
        HTTP_500_INTERNAL_SERVER_ERROR = 500

    status = _HttpStatus()

    class Depends:
        """Dependency injection marker compatible with FastAPI Depends."""
        def __init__(self, dependency: Optional[Callable[..., Any]] = None, use_cache: bool = True):
            self.dependency = dependency
            self.use_cache = use_cache

    class _ParamInfo:
        """Parameter specification placeholder."""
        def __init__(self, default: Any = None, alias: Optional[str] = None, **kwargs: Any):
            self.default = default
            self.alias = alias
            self.extra = kwargs

    class _HeaderInfo(_ParamInfo):
        """Header parameter specification placeholder."""
        pass

    class _QueryInfo(_ParamInfo):
        """Query parameter specification placeholder."""
        pass

    def Header(default: Any = None, *, alias: Optional[str] = None, **kwargs: Any) -> Any:
        return _HeaderInfo(default=default, alias=alias, **kwargs)

    def Query(default: Any = None, *, alias: Optional[str] = None, **kwargs: Any) -> Any:
        return _QueryInfo(default=default, alias=alias, **kwargs)

    class OAuth2PasswordBearer:
        """OAuth2 password bearer scheme placeholder."""
        def __init__(self, tokenUrl: str, auto_error: bool = True):
            self.tokenUrl = tokenUrl
            self.auto_error = auto_error

        def __call__(self, *args: Any, **kwargs: Any) -> Optional[str]:
            return None

    class HTTPBearer:
        """HTTP bearer scheme placeholder."""
        def __init__(self, auto_error: bool = True):
            self.auto_error = auto_error

        def __call__(self, *args: Any, **kwargs: Any) -> Optional[str]:
            return None

    class Route:
        """Endpoint route descriptor."""
        def __init__(
            self,
            path: str,
            endpoint: Callable[..., Any],
            methods: List[str],
            response_model: Optional[Any] = None,
            status_code: int = 200,
            **kwargs: Any,
        ):
            self.path = path
            self.endpoint = endpoint
            self.methods = [m.upper() for m in methods]
            self.response_model = response_model
            self.status_code = status_code
            self.kwargs = kwargs

    class APIRouter:
        """Lightweight APIRouter recording endpoints and paths."""
        def __init__(self, prefix: str = "", tags: Optional[List[str]] = None, **kwargs: Any):
            self.prefix = prefix
            self.tags = tags or []
            self.routes: List[Route] = []

        def add_api_route(
            self,
            path: str,
            endpoint: Callable[..., Any],
            methods: Optional[List[str]] = None,
            response_model: Optional[Any] = None,
            status_code: int = 200,
            **kwargs: Any,
        ) -> None:
            full_path = self.prefix + path if not path.startswith(self.prefix) else path
            route = Route(
                full_path,
                endpoint,
                methods or ["GET"],
                response_model=response_model,
                status_code=status_code,
                **kwargs,
            )
            self.routes.append(route)

        def get(self, path: str, response_model: Optional[Any] = None, status_code: int = 200, **kwargs: Any):
            def decorator(func: Callable[..., Any]):
                self.add_api_route(path, func, methods=["GET"], response_model=response_model, status_code=status_code, **kwargs)
                return func
            return decorator

        def post(self, path: str, response_model: Optional[Any] = None, status_code: int = 200, **kwargs: Any):
            def decorator(func: Callable[..., Any]):
                self.add_api_route(path, func, methods=["POST"], response_model=response_model, status_code=status_code, **kwargs)
                return func
            return decorator

        def put(self, path: str, response_model: Optional[Any] = None, status_code: int = 200, **kwargs: Any):
            def decorator(func: Callable[..., Any]):
                self.add_api_route(path, func, methods=["PUT"], response_model=response_model, status_code=status_code, **kwargs)
                return func
            return decorator

        def delete(self, path: str, response_model: Optional[Any] = None, status_code: int = 200, **kwargs: Any):
            def decorator(func: Callable[..., Any]):
                self.add_api_route(path, func, methods=["DELETE"], response_model=response_model, status_code=status_code, **kwargs)
                return func
            return decorator

        def websocket(self, path: str, **kwargs: Any):
            def decorator(func: Callable[..., Any]):
                self.add_api_route(path, func, methods=["WEBSOCKET"], **kwargs)
                return func
            return decorator

    class FastAPI:
        """Lightweight FastAPI application registering routes."""
        def __init__(self, title: str = "tro. API", lifespan: Optional[Any] = None, **kwargs: Any):
            self.title = title
            self.lifespan = lifespan
            self.routes: List[Route] = []
            self.middleware: List[Any] = []
            self.mounts: List[Tuple[str, Any, Optional[str]]] = []

        def mount(self, path: str, app: Any, name: Optional[str] = None) -> None:
            """Mount another ASGI application or StaticFiles under path prefix."""
            self.mounts.append((path.rstrip("/"), app, name))

        def add_middleware(self, middleware_class: Any, **kwargs: Any) -> None:
            """Register middleware (no-op in test/compat mode)."""
            self.middleware.append((middleware_class, kwargs))

        def include_router(self, router: APIRouter, prefix: str = "", **kwargs: Any) -> None:
            for r in router.routes:
                target_path = r.path
                if prefix and not target_path.startswith(prefix):
                    target_path = prefix + target_path
                self.routes.append(
                    Route(
                        target_path,
                        r.endpoint,
                        r.methods,
                        response_model=r.response_model,
                        status_code=r.status_code,
                        **r.kwargs,
                    )
                )

        def get(self, path: str, response_model: Optional[Any] = None, status_code: int = 200, **kwargs: Any):
            def decorator(func: Callable[..., Any]):
                self.routes.append(Route(path, func, ["GET"], response_model=response_model, status_code=status_code, **kwargs))
                return func
            return decorator

        def post(self, path: str, response_model: Optional[Any] = None, status_code: int = 200, **kwargs: Any):
            def decorator(func: Callable[..., Any]):
                self.routes.append(Route(path, func, ["POST"], response_model=response_model, status_code=status_code, **kwargs))
                return func
            return decorator

        def put(self, path: str, response_model: Optional[Any] = None, status_code: int = 200, **kwargs: Any):
            def decorator(func: Callable[..., Any]):
                self.routes.append(Route(path, func, ["PUT"], response_model=response_model, status_code=status_code, **kwargs))
                return func
            return decorator

        def delete(self, path: str, response_model: Optional[Any] = None, status_code: int = 200, **kwargs: Any):
            def decorator(func: Callable[..., Any]):
                self.routes.append(Route(path, func, ["DELETE"], response_model=response_model, status_code=status_code, **kwargs))
                return func
            return decorator

        def websocket(self, path: str, **kwargs: Any):
            def decorator(func: Callable[..., Any]):
                self.routes.append(Route(path, func, ["WEBSOCKET"], **kwargs))
                return func
            return decorator

class TestResponse:
    """Simulated HTTP response for TestClient."""
    def __init__(self, status_code: int, data: Any = None, headers: Optional[Dict[str, str]] = None):
        self.status_code = status_code
        self._data = data
        self.headers = headers or {}

    def json(self) -> Any:
        def _serialize(item: Any) -> Any:
            if isinstance(item, list):
                return [_serialize(x) for x in item]
            if isinstance(item, dict):
                return {k: _serialize(v) for k, v in item.items()}
            if hasattr(item, "model_dump"):
                return item.model_dump(mode="json")
            if hasattr(item, "dict"):
                return item.dict()
            return item
        return _serialize(self._data)

    @property
    def text(self) -> str:
        if isinstance(self._data, str):
            return self._data
        if isinstance(self._data, bytes):
            return self._data.decode("utf-8", errors="replace")
        if hasattr(self._data, "path") and Path(self._data.path).is_file():
            return Path(self._data.path).read_text(encoding="utf-8", errors="replace")
        if hasattr(self._data, "body"):
            body = self._data.body
            return body.decode("utf-8", errors="replace") if isinstance(body, bytes) else str(body)
        if hasattr(self._data, "content"):
            content = self._data.content
            return content.decode("utf-8", errors="replace") if isinstance(content, bytes) else str(content)
        return json.dumps(self.json(), default=str)

    @property
    def content(self) -> bytes:
        if isinstance(self._data, bytes):
            return self._data
        if isinstance(self._data, str):
            return self._data.encode("utf-8")
        if hasattr(self._data, "path") and Path(self._data.path).is_file():
            return Path(self._data.path).read_bytes()
        if hasattr(self._data, "body"):
            body = self._data.body
            return body if isinstance(body, bytes) else str(body).encode("utf-8")
        if hasattr(self._data, "content"):
            c = self._data.content
            return c if isinstance(c, bytes) else str(c).encode("utf-8")
        return self.text.encode("utf-8")

def _match_path(pattern: str, url: str) -> Tuple[bool, Dict[str, Any]]:
    p = pattern.strip("/")
    u = url.split("?")[0].strip("/")
    p_parts = [x for x in p.split("/") if x]
    u_parts = [x for x in u.split("/") if x]

    # Handle prefix differences like api/v1 or api/v1/auth
    if len(p_parts) != len(u_parts):
        if p_parts[:2] == ["api", "v1"] and p_parts[2:] == u_parts:
            p_parts = p_parts[2:]
        elif u_parts[:2] == ["api", "v1"] and u_parts[2:] == p_parts:
            u_parts = u_parts[2:]
        elif p_parts[:3] == ["api", "v1", "auth"] and p_parts[3:] == u_parts:
            p_parts = p_parts[3:]
        elif u_parts[:3] == ["api", "v1", "auth"] and u_parts[3:] == p_parts:
            u_parts = u_parts[3:]

    # Check for path converter in the last segment (e.g. {full_path:path})
    if p_parts and p_parts[-1].startswith("{") and p_parts[-1].endswith("}") and ":path" in p_parts[-1]:
        prefix_p = p_parts[:-1]
        if len(u_parts) < len(prefix_p):
            return False, {}
        params: Dict[str, Any] = {}
        for p_seg, u_seg in zip(prefix_p, u_parts[:len(prefix_p)]):
            if p_seg.startswith("{") and p_seg.endswith("}"):
                param_name = p_seg[1:-1].split(":")[0]
                params[param_name] = u_seg
            elif p_seg != u_seg:
                return False, {}
        raw_param = p_parts[-1][1:-1]
        param_name = raw_param.split(":")[0]
        params[param_name] = "/".join(u_parts[len(prefix_p):])
        return True, params

    if len(p_parts) != len(u_parts):
        return False, {}

    params = {}
    for p_seg, u_seg in zip(p_parts, u_parts):
        if p_seg.startswith("{") and p_seg.endswith("}"):
            param_name = p_seg[1:-1].split(":")[0]
            params[param_name] = u_seg
        elif p_seg != u_seg:
            return False, {}
    return True, params

def _resolve_dependencies(
    func: Callable[..., Any],
    path_params: Dict[str, Any],
    body_data: Any = None,
    headers: Optional[Dict[str, str]] = None,
    query_params: Optional[Dict[str, Any]] = None,
    session_override: Optional[Any] = None,
) -> Dict[str, Any]:
    import inspect
    sig = inspect.signature(func)
    kwargs: Dict[str, Any] = {}
    headers = headers or {}
    query_params = query_params or {}
    lower_headers = {k.lower(): v for k, v in headers.items()}

    for param_name, param in sig.parameters.items():
        ann = param.annotation
        target_cls = ann
        is_int_type = ann is int or ann == "int"
        if get_origin(ann) is Union:
            union_args = [a for a in get_args(ann) if a is not type(None)]
            if int in union_args:
                is_int_type = True
            if len(union_args) == 1:
                target_cls = union_args[0]

        if param_name in path_params:
            val = path_params[param_name]
            if is_int_type:
                try:
                    val = int(val)
                except (ValueError, TypeError):
                    pass
            kwargs[param_name] = val
            continue
        elif "id" in path_params and (param_name.endswith("_id") or param_name == "id"):
            val = path_params["id"]
            if is_int_type:
                try:
                    val = int(val)
                except (ValueError, TypeError):
                    pass
            kwargs[param_name] = val
            continue
        elif param_name == "id":
            id_candidates = [v for k, v in path_params.items() if k.endswith("_id")]
            if id_candidates:
                val = id_candidates[0]
                if is_int_type:
                    try:
                        val = int(val)
                    except (ValueError, TypeError):
                        pass
                kwargs[param_name] = val
                continue

        default = param.default

        if hasattr(default, "dependency") and getattr(default, "dependency", None) is not None:
            dep_func = default.dependency
            if getattr(dep_func, "__name__", "") == "get_session":
                if session_override is not None:
                    kwargs[param_name] = session_override
                else:
                    from .database import get_session
                    gen = get_session()
                    kwargs[param_name] = next(gen)
            elif type(dep_func).__name__ == "OAuth2PasswordBearer":
                auth_val = lower_headers.get("authorization", "")
                if auth_val.startswith("Bearer "):
                    kwargs[param_name] = auth_val[7:].strip()
                elif auth_val:
                    kwargs[param_name] = auth_val
                else:
                    kwargs[param_name] = None
            else:
                dep_kwargs = _resolve_dependencies(
                    dep_func,
                    path_params,
                    body_data=body_data,
                    headers=headers,
                    query_params=query_params,
                    session_override=session_override,
                )
                kwargs[param_name] = dep_func(**dep_kwargs)
            continue

        if hasattr(default, "alias") or hasattr(default, "default") or isinstance(default, _ParamInfo):
            alias = getattr(default, "alias", None) or param_name
            param_key = alias.lower()
            def_val = getattr(default, "default", None)
            if def_val is PydanticUndefined or str(type(def_val)) == "<class 'ellipsis'>" or str(def_val) == "Ellipsis":
                def_val = None
            val = lower_headers.get(param_key, query_params.get(alias, def_val))
            kwargs[param_name] = val
            continue

        if hasattr(target_cls, "model_validate") or (isinstance(target_cls, type) and issubclass(target_cls, BaseModel)):
            if body_data is not None:
                if isinstance(target_cls, type) and isinstance(body_data, target_cls):
                    kwargs[param_name] = body_data
                elif isinstance(body_data, dict):
                    kwargs[param_name] = target_cls(**body_data)
                else:
                    kwargs[param_name] = body_data
            elif default is not inspect.Parameter.empty:
                kwargs[param_name] = default
            continue

        if param_name in query_params:
            val = query_params[param_name]
            if is_int_type:
                try:
                    val = int(val)
                except (ValueError, TypeError):
                    pass
            kwargs[param_name] = val
            continue

        if param_name == "authorization":
            kwargs[param_name] = lower_headers.get("authorization")
            continue
        if param_name == "token":
            auth_val = lower_headers.get("authorization", "")
            if auth_val.startswith("Bearer "):
                kwargs[param_name] = auth_val[7:].strip()
            else:
                kwargs[param_name] = auth_val or None
            continue

        if param_name == "session":
            if session_override is not None:
                kwargs[param_name] = session_override
            else:
                from .database import get_session
                gen = get_session()
                kwargs[param_name] = next(gen)
            continue

        if default is not inspect.Parameter.empty:
            kwargs[param_name] = default

    return kwargs

class TestClient:
    """Standalone HTTP test client dispatching requests to FastAPI/APIRouter routes."""
    def __init__(self, app: Any):
        self.app = app

    def __enter__(self) -> "TestClient":
        if hasattr(self.app, "lifespan") and self.app.lifespan is not None:
            try:
                ctx = self.app.lifespan(self.app)
                if hasattr(ctx, "__aenter__"):
                    import asyncio
                    try:
                        loop = asyncio.get_event_loop()
                    except RuntimeError:
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                    if loop.is_running():
                        import concurrent.futures
                        with concurrent.futures.ThreadPoolExecutor() as executor:
                            executor.submit(asyncio.run, ctx.__aenter__()).result()
                    else:
                        loop.run_until_complete(ctx.__aenter__())
                    self._lifespan_ctx = ctx
                elif hasattr(ctx, "__enter__"):
                    ctx.__enter__()
                    self._lifespan_ctx = ctx
            except Exception:
                pass
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if hasattr(self, "_lifespan_ctx") and self._lifespan_ctx is not None:
            try:
                if hasattr(self._lifespan_ctx, "__aexit__"):
                    import asyncio
                    try:
                        loop = asyncio.get_event_loop()
                    except RuntimeError:
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                    if loop.is_running():
                        import concurrent.futures
                        with concurrent.futures.ThreadPoolExecutor() as executor:
                            executor.submit(asyncio.run, self._lifespan_ctx.__aexit__(exc_type, exc_val, exc_tb)).result()
                    else:
                        loop.run_until_complete(self._lifespan_ctx.__aexit__(exc_type, exc_val, exc_tb))
                elif hasattr(self._lifespan_ctx, "__exit__"):
                    self._lifespan_ctx.__exit__(exc_type, exc_val, exc_tb)
            except Exception:
                pass

    def request(
        self,
        method: str,
        url: str,
        json: Optional[Any] = None,
        data: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
        params: Optional[Dict[str, Any]] = None,
        session: Optional[Any] = None,
        **kwargs: Any,
    ) -> TestResponse:
        # Check mounted apps (e.g. /assets)
        mounts = list(getattr(self.app, "mounts", []))
        if hasattr(self.app, "routes"):
            for r in getattr(self.app, "routes", []):
                if hasattr(r, "app") and hasattr(r, "path") and not hasattr(r, "endpoint"):
                    mounts.append((getattr(r, "path", "").rstrip("/"), getattr(r, "app"), getattr(r, "name", None)))

        clean_url = url.split("?")[0].rstrip("/") or "/"
        for prefix, mounted_app, _ in mounts:
            if clean_url == prefix or clean_url.startswith(prefix + "/"):
                subpath = clean_url[len(prefix):].lstrip("/")
                directory = getattr(mounted_app, "directory", None)
                if directory is not None:
                    target = (Path(directory) / subpath).resolve()
                    try:
                        target.relative_to(Path(directory).resolve())
                    except (ValueError, RuntimeError):
                        return TestResponse(404, {"detail": "Not Found"})
                    if target.is_file():
                        import mimetypes
                        mime, _ = mimetypes.guess_type(str(target))
                        hdrs = {"content-type": mime or "application/octet-stream"}
                        return TestResponse(200, target.read_bytes(), headers=hdrs)
                    return TestResponse(404, {"detail": "Not Found"})
                elif hasattr(mounted_app, "get_response"):
                    try:
                        resp = mounted_app.get_response(subpath)
                        if resp is not None:
                            return TestResponse(getattr(resp, "status_code", 200), resp, headers=getattr(resp, "headers", {}))
                    except TypeError:
                        pass
                return TestResponse(404, {"detail": "Not Found"})

        def _get_routes(r_list: Any) -> List[Any]:
            flat = []
            for r in r_list:
                if hasattr(r, "original_router") and hasattr(r.original_router, "routes"):
                    flat.extend(_get_routes(r.original_router.routes))
                elif hasattr(r, "routes"):
                    flat.extend(_get_routes(r.routes))
                elif hasattr(r, "methods") and hasattr(r, "path"):
                    flat.append(r)
            return flat

        matched_route = None
        path_params: Dict[str, Any] = {}
        for r in _get_routes(getattr(self.app, "routes", [])):
            route_methods = getattr(r, "methods", set()) or set()
            if method.upper() in route_methods:
                m, p = _match_path(r.path, url)
                if m:
                    matched_route = r
                    path_params = p
                    break

        if not matched_route:
            return TestResponse(404, {"detail": f"Not Found: {method} {url}"})

        query_dict = dict(params or {})
        if "?" in url:
            from urllib.parse import parse_qs, urlsplit
            parsed_query = parse_qs(urlsplit(url).query)
            for k, v in parsed_query.items():
                if k not in query_dict:
                    query_dict[k] = v[0] if len(v) == 1 else v

        body_content = json if json is not None else data
        try:
            call_kwargs = _resolve_dependencies(
                matched_route.endpoint,
                path_params,
                body_data=body_content,
                headers=headers,
                query_params=query_dict,
                session_override=session,
            )
            res = matched_route.endpoint(**call_kwargs)
            status_code = getattr(res, "status_code", matched_route.status_code or 200)
            res_headers = getattr(res, "headers", {})
            return TestResponse(status_code, res, headers=res_headers)
        except HTTPException as exc:
            return TestResponse(exc.status_code, {"detail": exc.detail}, headers=exc.headers)
        except pydantic.ValidationError as exc:
            return TestResponse(422, {"detail": exc.errors()})
        except ValueError as exc:
            return TestResponse(400, {"detail": str(exc)})
        except Exception as exc:
            return TestResponse(500, {"detail": str(exc)})

    def get(self, url: str, **kwargs: Any) -> TestResponse:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> TestResponse:
        return self.request("POST", url, **kwargs)

    def put(self, url: str, **kwargs: Any) -> TestResponse:
        return self.request("PUT", url, **kwargs)

    def delete(self, url: str, **kwargs: Any) -> TestResponse:
        return self.request("DELETE", url, **kwargs)


if not FASTAPI_INSTALLED:
    fastapi_mod = types.ModuleType("fastapi")
    fastapi_mod.APIRouter = APIRouter
    fastapi_mod.Depends = Depends
    fastapi_mod.FastAPI = FastAPI
    fastapi_mod.Header = Header
    fastapi_mod.HTTPException = HTTPException
    fastapi_mod.Query = Query
    fastapi_mod.status = status
    fastapi_mod.CORSMiddleware = CORSMiddleware
    fastapi_mod.Response = Response
    fastapi_mod.HTMLResponse = HTMLResponse
    fastapi_mod.FileResponse = FileResponse
    fastapi_mod.StaticFiles = StaticFiles
    fastapi_mod.WebSocket = WebSocket
    fastapi_mod.WebSocketDisconnect = WebSocketDisconnect
    sys.modules["fastapi"] = fastapi_mod

    middleware_mod = types.ModuleType("fastapi.middleware")
    cors_mod = types.ModuleType("fastapi.middleware.cors")
    cors_mod.CORSMiddleware = CORSMiddleware
    middleware_mod.cors = cors_mod
    sys.modules["fastapi.middleware"] = middleware_mod
    sys.modules["fastapi.middleware.cors"] = cors_mod
    fastapi_mod.middleware = middleware_mod

    responses_mod = types.ModuleType("fastapi.responses")
    responses_mod.Response = Response
    responses_mod.HTMLResponse = HTMLResponse
    responses_mod.FileResponse = FileResponse
    sys.modules["fastapi.responses"] = responses_mod
    fastapi_mod.responses = responses_mod

    staticfiles_mod = types.ModuleType("fastapi.staticfiles")
    staticfiles_mod.StaticFiles = StaticFiles
    sys.modules["fastapi.staticfiles"] = staticfiles_mod
    fastapi_mod.staticfiles = staticfiles_mod

    security_mod = types.ModuleType("fastapi.security")
    security_mod.OAuth2PasswordBearer = OAuth2PasswordBearer
    security_mod.HTTPBearer = HTTPBearer
    sys.modules["fastapi.security"] = security_mod
    fastapi_mod.security = security_mod

testclient_mod = types.ModuleType("fastapi.testclient")
testclient_mod.TestClient = TestClient
sys.modules["fastapi.testclient"] = testclient_mod

__all__ = [
    "APIRouter",
    "CORSMiddleware",
    "Depends",
    "FastAPI",
    "FileResponse",
    "HTMLResponse",
    "Header",
    "HTTPException",
    "Query",
    "Request",
    "Response",
    "Session",
    "StaticFiles",
    "TestClient",
    "WebSocket",
    "WebSocketDisconnect",
    "create_engine",
    "select",
    "col",
    "status",
    "Field",
    "SQLModel",
]
