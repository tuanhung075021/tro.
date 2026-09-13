/*
 * Copyright (c) 2026 tro. Contributors
 * SPDX-License-Identifier: MIT
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useRealtimeEvent } from '../context/WebSocketContext';
import { Clock, RefreshCw, LogOut, ShieldAlert, User, Phone, Calendar, Info } from 'lucide-react';

export default function PendingAdminPage() {
  const { user, refreshUser, logout } = useAuth();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);

  // Realtime instant approval handling (< 100ms)
  useRealtimeEvent('ADMIN_APPROVED', async () => {
    toast.success('🎉 Chúc mừng! Yêu cầu của bạn đã được Root Admin phê duyệt!');
    await refreshUser();
  });

  useRealtimeEvent('ADMIN_REJECTED', async (data) => {
    toast.warning(`Yêu cầu quản trị viên bị từ chối${data?.reason ? `: ${data.reason}` : '.'}`);
    await refreshUser();
  });

  // Defensive fallback polling every 15s in case connection drops
  useEffect(() => {
    const timer = setInterval(() => {
      refreshUser();
    }, 15000);
    return () => clearInterval(timer);
  }, [refreshUser]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const freshUser = await refreshUser();
      if (freshUser?.role === 'admin' || freshUser?.role === 'root_admin') {
        toast.success('Chúc mừng! Tài khoản đã được phê duyệt làm Quản trị viên.');
      } else if (freshUser?.role === 'pending_admin') {
        toast.info('Tài khoản vẫn đang trong trạng thái chờ xét duyệt.');
      } else {
        toast.info(`Trạng thái tài khoản hiện tại: ${freshUser?.role || 'Chưa cập nhật'}`);
      }
    } catch (err) {
      toast.error('Không thể làm mới trạng thái. Vui lòng thử lại sau.');
    } finally {
      setRefreshing(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Vừa tạo';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8 text-center space-y-6 animate-scaleIn">
        {/* Animated Icon Visual Anchor */}
        <div className="relative mx-auto w-20 h-20 rounded-3xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-inner">
          <Clock className="w-10 h-10 animate-pulse" />
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
          </span>
        </div>

        {/* Badge & Headings */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-300">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Yêu cầu quyền Quản trị viên</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Tài khoản đang chờ xét duyệt
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
            Tài khoản admin của bạn đang chờ xét duyệt từ quản trị viên. Vui lòng chờ thông báo hoặc liên hệ Admin gốc.
          </p>
        </div>

        {/* User Context Info Box */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left space-y-2.5 text-xs sm:text-sm">
          <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-500 flex items-center gap-1.5">
              <User className="w-4 h-4 text-slate-400" />
              <span>Tên đăng nhập</span>
            </span>
            <span className="font-bold text-slate-900 font-mono">@{user?.username || '—'}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-500 flex items-center gap-1.5">
              <User className="w-4 h-4 text-slate-400" />
              <span>Họ và tên</span>
            </span>
            <span className="font-bold text-slate-900">{user?.full_name || 'Chưa cập nhật'}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-slate-400" />
              <span>Số điện thoại</span>
            </span>
            <span className="font-mono text-slate-800">{user?.phone || 'Chưa cung cấp'}</span>
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>Thời điểm đăng ký</span>
            </span>
            <span className="text-slate-700">{formatDate(user?.created_at)}</span>
          </div>
        </div>

        {/* Informative Note */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-left flex items-start gap-2.5 text-[11px] sm:text-xs text-blue-900">
          <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <span>
            Sau khi được phê duyệt, bạn sẽ có toàn quyền truy cập Cổng quản trị biểu giá điện nước và công cụ quản trị hệ thống.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 active:scale-[0.98] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-primary-500/20 transition-all disabled:opacity-60"
            title="Kiểm tra lại trạng thái xét duyệt"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Đang kiểm tra...' : 'Làm mới trạng thái'}</span>
          </button>

          <button
            onClick={logout}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-700 font-semibold text-xs sm:text-sm rounded-xl border border-slate-200 transition-all active:scale-[0.98]"
            title="Đăng xuất tài khoản"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </div>
  );
}
