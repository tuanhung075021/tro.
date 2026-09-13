/*
 * Copyright (c) 2026 tro. Contributors
 * SPDX-License-Identifier: MIT
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { notifications as notifApi } from '../services/api';
import {
  Zap,
  LogOut,
  Building2,
  UserCheck,
  ShieldCheck,
  ShieldAlert,
  Clock,
  FileText,
  Scale,
  Bell,
  CheckCheck,
  ExternalLink,
  FileCheck2,
  FileClock,
  KeyRound,
  ChevronDown,
  Trash2,
  Users,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import ChangePasswordModal from './ChangePasswordModal';
import DeleteAccountModal from './DeleteAccountModal';

export default function Navbar({
  currentView,
  setCurrentView,
  onOpenTariffModal,
  onOpenAuthModal,
  onSelectInvoice,
}) {
  const { user, isAuthenticated, isLandlord, isTenant, isAdmin, isRootAdmin, isPendingAdmin, logout } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const userDropdownRef = useRef(null);

  // Storage key: tro_notif_read_${user.id} -> { read_ids: string[], markAllReadTs: number }
  const getStoredNotifState = useCallback(() => {
    if (!user?.id) return { readIds: new Set(), markAllReadTs: 0 };
    try {
      const raw = localStorage.getItem(`tro_notif_read_${user.id}`);
      if (!raw) return { readIds: new Set(), markAllReadTs: 0 };
      const parsed = JSON.parse(raw);
      return {
        readIds: new Set(Array.isArray(parsed.read_ids) ? parsed.read_ids : []),
        markAllReadTs: typeof parsed.markAllReadTs === 'number' ? parsed.markAllReadTs : 0,
      };
    } catch {
      return { readIds: new Set(), markAllReadTs: 0 };
    }
  }, [user?.id]);

  const saveStoredNotifState = useCallback((readIdsSet, markAllReadTs) => {
    if (!user?.id) return;
    try {
      const payload = {
        read_ids: Array.from(readIdsSet),
        markAllReadTs: markAllReadTs,
      };
      localStorage.setItem(`tro_notif_read_${user.id}`, JSON.stringify(payload));
    } catch {
      // Storage quota fallback
    }
  }, [user?.id]);

  const fetchNotifs = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    try {
      const data = await notifApi.get();
      const { readIds, markAllReadTs } = getStoredNotifState();
      const list = (data || []).map((n) => {
        const nTime = n.timestamp ? new Date(n.timestamp).getTime() : 0;
        const isRead = readIds.has(n.id) || (markAllReadTs > 0 && nTime > 0 && nTime <= markAllReadTs);
        return {
          ...n,
          read: isRead,
        };
      });
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.read).length);
    } catch {
      // Fail silently on network error / unauthenticated
    }
  }, [isAuthenticated, user, getStoredNotifState]);

  // Fetch notifications on mount and every 30s
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    fetchNotifs();
    const timer = setInterval(fetchNotifs, 30000); // 30s poll

    // Immediately re-poll when TariffContext detects a version change
    const handleTariffChanged = () => fetchNotifs();
    window.addEventListener('tro:tariff_version_changed', handleTariffChanged);

    // Immediately re-poll on real-time WebSocket events
    const handleWsEvent = () => fetchNotifs();
    window.addEventListener('tro:ws_event', handleWsEvent);

    return () => {
      clearInterval(timer);
      window.removeEventListener('tro:tariff_version_changed', handleTariffChanged);
      window.removeEventListener('tro:ws_event', handleWsEvent);
    };
  }, [isAuthenticated, fetchNotifs]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowNotifDropdown(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = () => {
    const now = Date.now();
    const { readIds } = getStoredNotifState();
    notifications.forEach((n) => {
      if (n.id) readIds.add(n.id);
    });
    saveStoredNotifState(readIds, now);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleNotifClick = (n) => {
    const { readIds, markAllReadTs } = getStoredNotifState();
    if (n.id) readIds.add(n.id);
    saveStoredNotifState(readIds, markAllReadTs);
    setNotifications((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
    );
    setUnreadCount((c) => Math.max(0, c - (n.read ? 0 : 1)));
    setShowNotifDropdown(false);

    if (n.type === 'tariff_updated') {
      onOpenTariffModal?.();
    } else if (n.share_token) {
      onSelectInvoice?.(n.share_token);
    } else if (n.room_id) {
      if (currentView !== 'dashboard' && currentView !== 'home') {
        setCurrentView?.('home');
      }
      window.dispatchEvent(
        new CustomEvent('tro:focus_room', {
          detail: { roomId: n.room_id, requestId: n.request_id, type: n.type },
        })
      );
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const formatTimestamp = (ts) => {
    if (!ts) return null;
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now - d;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Vừa xong';
      if (diffMins < 60) return `${diffMins} phút trước`;
      const diffHrs = Math.floor(diffMins / 60);
      if (diffHrs < 24) return `${diffHrs} giờ trước`;
      const diffDays = Math.floor(diffHrs / 24);
      if (diffDays < 7) return `${diffDays} ngày trước`;
      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return null;
    }
  };

  const getNotifStyle = (type, isRead) => {
    const base = isRead ? 'bg-white' : '';
    if (type === 'invoice_draft') return `${isRead ? 'bg-white' : 'bg-amber-50/60'}`;
    if (type === 'invoice_published') return `${isRead ? 'bg-white' : 'bg-emerald-50/60'}`;
    if (type === 'tariff_updated') return `${isRead ? 'bg-white' : 'bg-blue-50/60'}`;
    if (type === 'occupancy_request_pending') return `${isRead ? 'bg-white' : 'bg-purple-50/70'}`;
    if (type === 'occupancy_request_approved') return `${isRead ? 'bg-white' : 'bg-emerald-50/70'}`;
    if (type === 'occupancy_request_rejected') return `${isRead ? 'bg-white' : 'bg-rose-50/70'}`;
    return base;
  };

  const getNotifIcon = (type) => {
    if (type === 'invoice_draft')
      return <FileClock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />;
    if (type === 'invoice_published')
      return <FileCheck2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />;
    if (type === 'tariff_updated')
      return <Scale className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />;
    if (type === 'occupancy_request_pending')
      return <Users className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />;
    if (type === 'occupancy_request_approved')
      return <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />;
    if (type === 'occupancy_request_rejected')
      return <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />;
    return <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />;
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Brand Logo & Slogan */}
            <div
              className="flex items-center gap-2 sm:gap-3 cursor-pointer"
              onClick={() => {
                setCurrentView?.('home');
              window.history.pushState(null, '', '/');
            }}
          >
            <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-primary-600 text-white shadow-md shadow-primary-500/20 flex-shrink-0">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                  tro<span className="text-primary-600">.</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-500 hidden md:block">
                Hệ thống Quản lý Lưu trú & Đối chiếu Chi phí Điện Nước Minh bạch
              </p>
            </div>
          </div>

          {/* Center / Nav Items */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => {
                setCurrentView?.('public');
                window.history.pushState(null, '', '/public');
              }}
              title="Tra cứu công khai"
              aria-label="Tra cứu công khai hóa đơn"
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center gap-1.5 p-2.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium rounded-xl transition-colors ${
                currentView === 'public'
                  ? 'bg-slate-100 text-slate-900 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <span className="hidden sm:inline">Tra cứu công khai</span>
            </button>

            {/* Single Consolidated Tariff Modal Button */}
            <button
              onClick={onOpenTariffModal}
              title="Biểu giá quy định"
              aria-label="Xem biểu giá quy định nhà nước"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center gap-1.5 p-2.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <Scale className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <span className="hidden sm:inline">Biểu giá quy định</span>
            </button>
          </nav>

          {/* User Profile / Status / Logout */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated && user ? (
              <>
                {/* Notification Bell Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowNotifDropdown((prev) => !prev)}
                    className="relative min-w-[44px] min-h-[44px] p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors flex items-center justify-center"
                    title="Thông báo"
                    aria-label="Thông báo hệ thống"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse" />
                    )}
                  </button>

                  {/* Dropdown panel */}
                  {showNotifDropdown && (
                    <div className="fixed inset-x-2.5 top-16 sm:top-auto sm:inset-x-auto sm:absolute sm:right-0 sm:mt-2 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 max-h-[80vh] flex flex-col">
                      <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <Bell className="w-4 h-4 text-primary-600" />
                          <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            Thông báo
                          </span>
                          {unreadCount > 0 && (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-black rounded-full">
                              {unreadCount}
                            </span>
                          )}
                        </div>
                        {notifications.length > 0 && (
                          <button
                            onClick={handleMarkAllRead}
                            className="min-h-[44px] px-2.5 text-[11px] font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1 rounded-lg hover:bg-primary-50 transition-colors"
                            title="Đã đọc tất cả thông báo"
                            aria-label="Đã đọc tất cả thông báo"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>Đã đọc tất cả</span>
                          </button>
                        )}
                      </div>

                      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 overscroll-contain scrollbar-thin">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center text-xs text-slate-400">
                            Chưa có thông báo mới nào
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <div
                              key={n.id}
                              onClick={() => handleNotifClick(n)}
                              className={`p-3.5 hover:bg-slate-50 cursor-pointer transition-colors ${getNotifStyle(n.type, n.read)}`}
                            >
                              <div className="flex items-start gap-2.5">
                                {getNotifIcon(n.type)}
                                <div className="flex-1 min-w-0 space-y-0.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <h4 className={`text-xs font-bold leading-tight ${n.read ? 'text-slate-600' : 'text-slate-900'}`}>
                                      {n.title}
                                    </h4>
                                    {n.short_code && (
                                      <span className="flex-shrink-0 px-1.5 py-0.5 bg-slate-100 font-mono text-[10px] font-bold text-slate-600 rounded border border-slate-200">
                                        {n.short_code}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-500 leading-snug">{n.message}</p>
                                  {n.timestamp && (
                                    <p className="text-[10px] text-slate-400">{formatTimestamp(n.timestamp)}</p>
                                  )}
                                </div>
                                {!n.read && (
                                  <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-1" />
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Consolidated Avatar & User Dropdown Menu */}
                <div className="relative" ref={userDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowUserDropdown((prev) => !prev)}
                    className="min-h-[44px] flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-2xl hover:bg-slate-100 active:scale-[0.98] transition-all border border-transparent hover:border-slate-200"
                    title="Menu tài khoản của bạn"
                    aria-label="Menu tài khoản"
                  >
                    {/* Avatar circle with initials */}
                    <div
                      className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center text-xs flex-shrink-0 border border-primary-300 shadow-sm"
                    >
                      {getInitials(user.full_name || user.username)}
                    </div>

                    {/* Role Badge on desktop */}
                    {isRootAdmin && (
                      <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-300 shadow-sm">
                        <ShieldAlert className="w-3 h-3 text-purple-700" />
                        <span>Root Admin</span>
                      </span>
                    )}
                    {!isRootAdmin && isAdmin && (
                      <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300 shadow-sm">
                        <ShieldCheck className="w-3 h-3 text-indigo-700" />
                        <span>Admin</span>
                      </span>
                    )}
                    {isPendingAdmin && (
                      <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                        <Clock className="w-3 h-3 text-amber-700" />
                        <span>Chờ duyệt</span>
                      </span>
                    )}
                    {isLandlord && (
                      <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <Building2 className="w-3 h-3" />
                        <span>Chủ trọ</span>
                      </span>
                    )}
                    {isTenant && (
                      <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                        <UserCheck className="w-3 h-3" />
                        <span>Người thuê</span>
                      </span>
                    )}

                    {/* User Name on lg screens */}
                    <div className="hidden lg:block text-left">
                      <p className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[120px]">
                        {user.full_name || user.username}
                      </p>
                      <p className="text-[10px] font-mono text-slate-500 truncate max-w-[120px]">
                        @{user.username}
                      </p>
                    </div>

                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  {/* Dropdown Menu Panel */}
                  {showUserDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 p-2 space-y-1">
                      {/* User Info Header */}
                      <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-left">
                        <p className="text-xs font-black text-slate-900 truncate">
                          {user.full_name || user.username}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 truncate">
                          @{user.username}
                        </p>
                        <div className="pt-1.5 flex items-center gap-1.5">
                          {isRootAdmin && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                              <ShieldAlert className="w-3 h-3" /> Root Admin
                            </span>
                          )}
                          {!isRootAdmin && isAdmin && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                              <ShieldCheck className="w-3 h-3" /> Quản trị viên
                            </span>
                          )}
                          {isPendingAdmin && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                              <Clock className="w-3 h-3" /> Chờ xét duyệt
                            </span>
                          )}
                          {isLandlord && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <Building2 className="w-3 h-3" /> Chủ nhà trọ
                            </span>
                          )}
                          {isTenant && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                              <UserCheck className="w-3 h-3" /> Người thuê trọ
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="h-px bg-slate-100 my-1" />

                      {/* Button: Đổi mật khẩu */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserDropdown(false);
                          setShowChangePasswordModal(true);
                        }}
                        className="w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:text-primary-600 hover:bg-primary-50/60 rounded-xl transition-colors text-left"
                      >
                        <KeyRound className="w-4 h-4 text-slate-400" />
                        <span>Đổi mật khẩu</span>
                      </button>

                      {/* Button: Đăng xuất */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserDropdown(false);
                          logout();
                        }}
                        className="w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 hover:text-red-600 hover:bg-red-50/60 rounded-xl transition-colors text-left"
                      >
                        <LogOut className="w-4 h-4 text-slate-400" />
                        <span>Đăng xuất</span>
                      </button>

                      <div className="h-px bg-slate-100 my-1" />

                      {/* Button: Xóa tài khoản */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserDropdown(false);
                          setShowDeleteAccountModal(true);
                        }}
                        className="w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors text-left"
                      >
                        <Trash2 className="w-4 h-4 text-rose-500" />
                        <span>Xóa tài khoản</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button
                onClick={onOpenAuthModal}
                title="Đăng nhập / Đăng ký"
                aria-label="Đăng nhập hoặc đăng ký tài khoản"
                className="min-h-[44px] flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm transition-all"
              >
                <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                <span>Đăng nhập<span className="hidden sm:inline"> / Đăng ký</span></span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>

    {/* Change Password Modal */}
    <ChangePasswordModal
      isOpen={showChangePasswordModal}
      onClose={() => setShowChangePasswordModal(false)}
    />

    {/* Delete Account Modal */}
    <DeleteAccountModal
      isOpen={showDeleteAccountModal}
      onClose={() => setShowDeleteAccountModal(false)}
      user={user}
      onAccountDeleted={() => {
        logout();
        window.location.href = '/';
      }}
    />
  </>
  );
}
