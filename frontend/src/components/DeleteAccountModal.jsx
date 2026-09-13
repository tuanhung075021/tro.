/*
 * Copyright (c) 2026 tro. Contributors
 * SPDX-License-Identifier: MIT
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../context/ToastContext';
import { auth as authApi } from '../services/api';
import { AlertTriangle, Eye, EyeOff, Lock, X, Loader2 } from 'lucide-react';

export default function DeleteAccountModal({ isOpen, onClose, user, onAccountDeleted }) {
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Lock body scroll and listen for Escape key
  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e) => {
        if (e.key === 'Escape' && !submitting) onClose?.();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (submitting) return;
    setPassword('');
    setErrorMsg(null);
    setShowPassword(false);
    onClose?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('Vui lòng nhập mật khẩu tài khoản để xác nhận');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);

    try {
      await authApi.deleteAccount({ password });
      toast.success('Tài khoản của bạn đã được xóa thành công.');
      handleClose();
      if (onAccountDeleted) {
        onAccountDeleted();
      } else {
        window.location.href = '/';
      }
    } catch (err) {
      const msg =
        err.message ||
        'Không thể xóa tài khoản. Vui lòng kiểm tra lại mật khẩu hoặc liên hệ quản trị viên.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const isLandlord = user?.role === 'landlord';
  const isTenant = user?.role === 'tenant';
  const isRootAdmin = user?.role === 'root_admin';

  const modalContent = (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overscroll-contain animate-fadeIn">
      {/* Backdrop click to close */}
      <div className="fixed inset-0" onClick={handleClose} aria-hidden="true" />

      <div className="relative z-10 my-auto bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-rose-100 animate-scaleIn">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-rose-600">
                Xóa tài khoản vĩnh viễn
              </h3>
              <p className="text-xs text-slate-500">
                Hành động này không thể hoàn tác sau khi thực hiện
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
            aria-label="Đóng hộp thoại"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Danger Warning Box */}
        <div className="p-3.5 bg-rose-50/80 rounded-2xl border border-rose-200 text-xs text-rose-900 space-y-1.5 leading-relaxed">
          <p className="font-bold flex items-center gap-1.5 text-rose-700">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Cảnh báo rủi ro dữ liệu:
          </p>
          <ul className="list-disc list-inside space-y-1 pl-1 text-rose-800">
            <li>Toàn bộ thông tin hồ sơ của bạn sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu.</li>
            {isLandlord && (
              <li>
                Nếu các phòng trọ của bạn đang có người thuê, hệ thống sẽ <strong>chặn xóa</strong> để bảo vệ quyền lợi người thuê. Khi tất cả phòng đã trống, các khu trọ và lịch sử hóa đơn sẽ được dọn dẹp sạch sẽ.
              </li>
            )}
            {isTenant && (
              <li>
                Bạn sẽ được tự động giải phóng khỏi phòng trọ hiện tại và phòng sẽ chuyển về trạng thái trống.
              </li>
            )}
            {isRootAdmin && (
              <li>
                Hệ thống <strong>không cho phép xóa</strong> tài khoản nếu bạn là Root Admin duy nhất.
              </li>
            )}
          </ul>
        </div>

        {/* Error message banner */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Confirmation Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nhập mật khẩu tài khoản (@{user?.username || 'bạn'}) để xác nhận:
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu chính xác..."
                autoFocus
                disabled={submitting}
                className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-colors disabled:bg-slate-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors min-h-[44px] disabled:opacity-50"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={!password.trim() || submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md shadow-rose-500/20 transition-all flex items-center gap-2 min-h-[44px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang xử lý...</span>
                </>
              ) : (
                <span>Xác nhận xóa tài khoản</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
}
