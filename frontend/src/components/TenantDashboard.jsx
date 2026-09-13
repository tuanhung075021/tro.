/*
 * Copyright (c) 2026 tro. Contributors
 * SPDX-License-Identifier: MIT
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { rooms as roomApi } from '../services/api';
import { useRealtimeEvent } from '../context/WebSocketContext';
import {
  Building2,
  Home,
  FileText,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Zap,
  Droplets,
  ExternalLink,
  Check,
  Copy,
  Users,
  Phone,
  User,
  MapPin,
  Plus,
  KeyRound,
  RefreshCw,
  Printer,
  Loader2,
  Lock,
  Clock,
  Edit3,
} from 'lucide-react';

export default function TenantDashboard({ onViewPublicInvoice }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [myRooms, setMyRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [invoicesList, setInvoicesList] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);

  // Modals & form state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);

  // Dual-approval Occupancy Change State
  const [highlightRoomId, setHighlightRoomId] = useState(null);
  const [occupancyRequests, setOccupancyRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [showOccupancyModal, setShowOccupancyModal] = useState(false);
  const [occupancyForm, setOccupancyForm] = useState({
    new_people_count: 1,
    effective_date: new Date().toISOString().split('T')[0],
    note: '',
    password: '',
  });
  const [occupancySubmitting, setOccupancySubmitting] = useState(false);
  const [occupancyError, setOccupancyError] = useState(null);
  const [rejectModalReq, setRejectModalReq] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Fetch occupancy requests for room
  const fetchOccupancyRequests = useCallback(async (roomId) => {
    if (!roomId) {
      setOccupancyRequests([]);
      return;
    }
    setLoadingRequests(true);
    try {
      const reqs = await roomApi.getOccupancyRequests(roomId);
      setOccupancyRequests(reqs || []);
    } catch (err) {
      console.error('Error fetching occupancy requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  // Fetch invoices for a given room
  const fetchInvoices = useCallback(async (roomId) => {
    if (!roomId) {
      setInvoicesList([]);
      return;
    }
    setLoadingInvoices(true);
    try {
      const invs = await roomApi.getInvoices(roomId);
      // Tenants only see published invoices; drafts are hidden until published by landlord
      const published = (invs || []).filter((i) => i.status === 'published');
      setInvoicesList(published);
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setInvoicesList([]);
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  // Fetch rooms assigned to this tenant
  const fetchMyRooms = useCallback(async () => {
    setLoadingRooms(true);
    setError(null);
    try {
      const roomsData = await roomApi.getMyRooms();
      const rooms = roomsData || [];
      setMyRooms(rooms);

      if (rooms.length > 0) {
        // Keep current room if still valid, otherwise pick first
        setSelectedRoom((prev) => {
          const match = prev ? rooms.find((r) => r.id === prev.id) : null;
          const current = match || rooms[0];
          fetchInvoices(current.id);
          fetchOccupancyRequests(current.id);
          return current;
        });
      } else {
        setSelectedRoom(null);
        setInvoicesList([]);
        setOccupancyRequests([]);
      }
    } catch (err) {
      setError(err.message || 'Không thể tải thông tin phòng trọ.');
      setMyRooms([]);
      setSelectedRoom(null);
      setInvoicesList([]);
      setOccupancyRequests([]);
    } finally {
      setLoadingRooms(false);
    }
  }, [fetchInvoices, fetchOccupancyRequests]);

  useEffect(() => {
    fetchMyRooms();
  }, [fetchMyRooms]);

  // Handle focus_room event from notification clicks
  useEffect(() => {
    const handleFocusRoom = (e) => {
      const { roomId } = e.detail || {};
      if (!roomId) return;
      const targetRoom = myRooms.find((r) => r.id === roomId);
      if (targetRoom) {
        setSelectedRoom(targetRoom);
        fetchInvoices(targetRoom.id);
        fetchOccupancyRequests(targetRoom.id);
      }
      setHighlightRoomId(roomId);
      setTimeout(() => {
        const el = document.getElementById(`tenant-room-card-${roomId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 250);
      setTimeout(() => setHighlightRoomId(null), 4000);
    };
    window.addEventListener('tro:focus_room', handleFocusRoom);
    return () => window.removeEventListener('tro:focus_room', handleFocusRoom);
  }, [myRooms, fetchInvoices, fetchOccupancyRequests]);

  // Realtime WebSocket listeners
  useRealtimeEvent('INVOICE_CREATED', () => {
    toast.info('Chủ trọ vừa phát hành hóa đơn mới cho phòng của bạn!');
    if (selectedRoom?.id) {
      fetchInvoices(selectedRoom.id);
    }
  });

  useRealtimeEvent('INVOICE_UPDATED', () => {
    if (selectedRoom?.id) {
      fetchInvoices(selectedRoom.id);
    }
  });

  useRealtimeEvent('ROOM_ASSIGNED', () => {
    toast.success('Bạn đã được gán vào phòng trọ!');
    fetchMyRooms();
  });

  useRealtimeEvent('TENANT_REMOVED', () => {
    toast.warning('Bạn đã rời khỏi phòng trọ.');
    fetchMyRooms();
  });

  useRealtimeEvent('QUOTA_REQUEST_CREATED', (data) => {
    toast.info('Có đề xuất thay đổi số người định mức phòng!');
    if (selectedRoom?.id) fetchOccupancyRequests(selectedRoom.id);
  });

  useRealtimeEvent('QUOTA_REQUEST_APPROVED', (data) => {
    toast.success(`Đề xuất đổi số người (${data?.new_count} người) đã được phê duyệt thành công!`);
    fetchMyRooms();
    if (selectedRoom?.id) fetchOccupancyRequests(selectedRoom.id);
  });

  useRealtimeEvent('QUOTA_REQUEST_REJECTED', (data) => {
    toast.warning(`Đề xuất đổi số người đã bị từ chối: ${data?.reject_reason || 'Không có lý do'}`);
    if (selectedRoom?.id) fetchOccupancyRequests(selectedRoom.id);
  });

  useRealtimeEvent('ROOM_DELETED', (data) => {
    if (selectedRoom?.id === data?.room_id) {
      toast.warning(`Phòng ${data?.room_number || ''} đã bị xóa.`);
      fetchMyRooms();
    }
  });

  useRealtimeEvent('TARIFF_UPDATED', (data) => {
    toast.info(`Biểu giá điện nước nhà nước vừa được cập nhật (${data?.tariff_version || ''})!`);
  });

  const handleSelectRoom = (room) => {
    setSelectedRoom(room);
    fetchInvoices(room.id);
    fetchOccupancyRequests(room.id);
  };

  const handleOpenOccupancyModal = () => {
    if (!selectedRoom) return;
    setOccupancyForm({
      new_people_count: selectedRoom.current_people_count || 1,
      effective_date: new Date().toISOString().split('T')[0],
      note: '',
      password: '',
    });
    setOccupancyError(null);
    setShowOccupancyModal(true);
  };

  const handleSubmitOccupancyRequest = async (e) => {
    e.preventDefault();
    if (!occupancyForm.password) {
      setOccupancyError('Vui lòng nhập mật khẩu tài khoản cá nhân để xác thực.');
      return;
    }
    setOccupancySubmitting(true);
    setOccupancyError(null);
    try {
      await roomApi.requestOccupancyChange(selectedRoom.id, {
        new_people_count: parseInt(occupancyForm.new_people_count, 10),
        effective_date: occupancyForm.effective_date,
        note: occupancyForm.note || null,
        password: occupancyForm.password,
      });
      toast.success('Yêu cầu đổi số người đã được gửi đến chủ trọ để xác thực kép!');
      setShowOccupancyModal(false);
      fetchOccupancyRequests(selectedRoom.id);
    } catch (err) {
      setOccupancyError(err.message || 'Không thể tạo yêu cầu. Vui lòng kiểm tra lại mật khẩu.');
    } finally {
      setOccupancySubmitting(false);
    }
  };

  const handleApproveRequest = async (reqId) => {
    try {
      await roomApi.approveOccupancyRequest(reqId);
      toast.success('Đã đồng ý phê duyệt số người mới cho phòng!');
      fetchMyRooms();
      if (selectedRoom?.id) fetchOccupancyRequests(selectedRoom.id);
    } catch (err) {
      toast.error(err.message || 'Không thể phê duyệt yêu cầu.');
    }
  };

  const handleRejectRequest = async () => {
    if (!rejectModalReq) return;
    setRejecting(true);
    try {
      await roomApi.rejectOccupancyRequest(rejectModalReq.id, rejectReason);
      toast.info('Đã từ chối đề xuất đổi số người.');
      setRejectModalReq(null);
      setRejectReason('');
      if (selectedRoom?.id) fetchOccupancyRequests(selectedRoom.id);
    } catch (err) {
      toast.error(err.message || 'Không thể từ chối yêu cầu.');
    } finally {
      setRejecting(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    const cleanCode = inviteCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      setJoinError('Vui lòng nhập mã mời phòng.');
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const joined = await roomApi.join({ invite_code: cleanCode });
      toast.success(`Đã tham gia Phòng ${joined.room_number} thành công!`);
      setInviteCodeInput('');
      setShowJoinModal(false);
      await fetchMyRooms();
    } catch (err) {
      setJoinError(err.message || 'Mã mời phòng không hợp lệ hoặc phòng đã có người thuê.');
    } finally {
      setJoining(false);
    }
  };

  const handleCopy = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopiedToken(key);
    toast.success('Đã sao chép vào bộ nhớ tạm!');
    setTimeout(() => setCopiedToken(null), 2500);
  };

  return (
    <div className="space-y-4 sm:space-y-8">
      {/* Clean SaaS Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Phòng trọ của tôi
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">
            Theo dõi chi tiết phòng ở, định mức và đối chiếu minh bạch các hóa đơn điện nước
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {myRooms.length > 0 && (
            <button
              onClick={() => {
                setJoinError(null);
                setInviteCodeInput('');
                setShowJoinModal(true);
              }}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 active:scale-[0.98] border border-primary-200 rounded-xl transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Tham gia phòng khác</span>
            </button>
          )}

          <button
            onClick={fetchMyRooms}
            title="Làm mới"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 active:scale-[0.98] rounded-xl transition-colors border border-slate-200 sm:border-transparent"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-100/50 rounded-xl font-bold ml-2 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-sm text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100/50 rounded-xl font-bold ml-2 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {loadingRooms ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-9 h-9 text-primary-600 animate-spin" />
          <p className="text-sm font-medium text-slate-500">Đang tải dữ liệu phòng trọ của bạn...</p>
        </div>
      ) : myRooms.length === 0 ? (
        /* Empty State: Tenant not assigned to any room */
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 p-5 sm:p-10 text-center max-w-xl mx-auto shadow-sm space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-primary-50 border border-primary-100 flex items-center justify-center text-primary-600 mx-auto shadow-inner">
            <Home className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900">
              Bạn chưa được gán vào phòng trọ nào
            </h2>
            <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">
              Để bắt đầu theo dõi hóa đơn và định mức điện nước minh bạch, bạn có thể thực hiện theo một trong hai cách sau:
            </p>
          </div>

          {/* Step Guidance Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center text-[11px] font-black">1</span>
                <span>Chủ trọ gán trực tiếp</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Cung cấp Username <strong className="text-slate-800 font-mono">@{user?.username}</strong> {user?.phone ? <>hoặc SĐT <strong className="text-slate-800">{user.phone}</strong></> : null} để chủ trọ thêm bạn vào danh sách phòng.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-primary-50/50 border border-primary-100 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary-900">
                <span className="w-5 h-5 rounded-full bg-primary-200 text-primary-800 inline-flex items-center justify-center text-[11px] font-black">2</span>
                <span>Dùng Mã mời phòng</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Yêu cầu chủ trọ cấp Mã mời gồm 8 ký tự và nhập trực tiếp vào ô bên dưới để tự động tham gia ngay.
              </p>
            </div>
          </div>

          {/* Direct Invite Code Input Form */}
          <div className="pt-4 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-800 mb-3 text-left">
              Nhập Mã mời phòng (Invite Code):
            </p>

            {joinError && (
              <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 text-left">
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoinRoom} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                  placeholder="Ví dụ: AB3K9X1Z"
                  className="min-h-[44px] h-12 w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm font-mono text-slate-900 uppercase tracking-wider focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={joining}
                className="min-h-[44px] h-12 w-full sm:w-auto px-6 py-2.5 bg-primary-600 hover:bg-primary-700 active:scale-[0.98] text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm transition-all whitespace-nowrap disabled:opacity-50 flex items-center justify-center"
              >
                {joining ? 'Đang kết nối...' : 'Tham gia phòng'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Room Assigned: Display Property & Room Card + Invoices */
        <div className="space-y-6">
          {/* Room Selector if multiple rooms */}
          {myRooms.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              <span className="text-xs text-slate-400 font-semibold mr-1 whitespace-nowrap">Phòng của bạn:</span>
              {myRooms.map((r) => {
                const active = selectedRoom?.id === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => handleSelectRoom(r)}
                    className={`min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center ${
                      active
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    Phòng {r.room_number} {r.property_name ? `• ${r.property_name}` : ''}
                  </button>
                );
              })}
            </div>
          )}

          {/* Active Room Overview Card */}
          {selectedRoom && (
            <div
              id={`tenant-room-card-${selectedRoom.id}`}
              className={`bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 p-3.5 sm:p-7 shadow-sm transition-all duration-500 ${
                highlightRoomId === selectedRoom.id ? 'ring-4 ring-primary-500 shadow-xl' : ''
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                {/* Left: Property & Room Identity */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full border border-emerald-200">
                      Đang thuê
                    </span>
                    <span className="text-xs text-slate-400">
                      Mã định danh: #{selectedRoom.id}
                    </span>
                  </div>

                  <div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                      Phòng {selectedRoom.room_number}
                    </h2>
                    <p className="text-sm font-semibold text-slate-700 mt-1 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-primary-600" />
                      <span>{selectedRoom.property_name || 'Khu trọ'}</span>
                    </p>
                    {selectedRoom.property_address && (
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{selectedRoom.property_address}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Landlord & Quota Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Quota */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Users className="w-3.5 h-3.5 text-primary-600" />
                        <span className="font-semibold">Định mức sử dụng:</span>
                      </div>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <p className="text-base font-black text-slate-900">
                        {selectedRoom.current_people_count} người
                      </p>
                      <button
                        onClick={handleOpenOccupancyModal}
                        className="text-[11px] font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 active:scale-95 px-2.5 py-1.5 rounded-xl border border-primary-200 transition-all flex items-center gap-1 min-h-[32px] shadow-xs"
                        title="Cấu hình số người ở thực tế (Yêu cầu xác thực kép bảo mật)"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-primary-600" />
                        <span>Cấu hình số người</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">Dùng tính bậc thang lũy tiến (4 người = 1 hộ định mức)</p>
                  </div>

                  {/* Landlord Contact */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <User className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-semibold">Chủ nhà trọ:</span>
                    </div>
                    <p className="text-sm font-bold text-slate-900">
                      {selectedRoom.landlord_name || 'Chủ trọ'}
                    </p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{selectedRoom.landlord_phone || 'Chưa cập nhật SĐT'}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Dual-approval Pending Request Banner */}
              {(() => {
                const pendingReq = occupancyRequests.find((r) => r.status === 'pending');
                if (!pendingReq) return null;
                if (pendingReq.requested_by_role === 'tenant') {
                  return (
                    <div className="mt-4 p-4 rounded-2xl bg-amber-50/90 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 text-amber-900">
                        <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <div>
                          <p className="font-bold">Yêu cầu thay đổi số người đang chờ chủ trọ duyệt:</p>
                          <p className="text-amber-800 mt-0.5">
                            Đổi thành <strong>{pendingReq.new_people_count} người</strong> (áp dụng từ ngày {pendingReq.effective_date}){pendingReq.note ? ` • Ghi chú: ${pendingReq.note}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="px-3 py-1 bg-amber-200/80 text-amber-900 text-xs font-bold rounded-full self-start sm:self-auto">
                        Đang chờ xét duyệt
                      </span>
                    </div>
                  );
                }
                return (
                  <div className="mt-4 p-4 rounded-2xl bg-primary-50 border border-primary-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                    <div className="flex items-start sm:items-center gap-2.5 text-primary-950">
                      <ShieldAlert className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                      <div>
                        <p className="font-bold text-sm">Chủ trọ đề xuất thay đổi số người định mức:</p>
                        <p className="text-slate-600 mt-0.5">
                          Đổi từ <strong>{pendingReq.old_people_count} người</strong> thành <strong>{pendingReq.new_people_count} người</strong> (áp dụng từ ngày {pendingReq.effective_date}){pendingReq.note ? ` • Ghi chú: ${pendingReq.note}` : ''}.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        onClick={() => handleApproveRequest(pendingReq.id)}
                        className="min-h-[38px] px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        <Check className="w-4 h-4" />
                        <span>Đồng ý duyệt</span>
                      </button>
                      <button
                        onClick={() => {
                          setRejectModalReq(pendingReq);
                          setRejectReason('');
                        }}
                        className="min-h-[38px] px-3.5 py-1.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-semibold rounded-xl text-xs transition-colors"
                      >
                        <span>Từ chối</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Invoices List */}
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 p-3.5 sm:p-8 space-y-4 sm:space-y-6 shadow-sm">
            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary-600" />
                  <span>Bảng kê hóa đơn & Đối chiếu tiền thu</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Kiểm tra chi phí điện nước và số tiền chênh lệch theo quy định bậc thang nhà nước
                </p>
              </div>
            </div>

            {loadingInvoices ? (
              <div className="p-10 text-center flex flex-col items-center justify-center space-y-3">
                <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                <p className="text-xs sm:text-sm text-slate-500 font-medium">Đang tải danh sách hóa đơn...</p>
              </div>
            ) : invoicesList.length === 0 ? (
              <div className="p-10 border-2 border-dashed border-slate-200 rounded-2xl text-center">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">Phòng này chưa có hóa đơn nào</p>
                <p className="text-xs text-slate-400 mt-1">
                  Khi chủ trọ chốt số công tơ điện nước hàng tháng, bảng kê minh bạch sẽ tự động hiển thị tại đây.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {invoicesList.map((inv) => {
                  const isOvercharged = inv.diff_amount > 0;
                  return (
                    <div
                      key={inv.id}
                      className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                        isOvercharged
                          ? 'border-red-200 bg-red-50/30 hover:bg-red-50/50'
                          : 'border-slate-200 bg-slate-50/40 hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        {/* Month & Overcharge Status */}
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-500" />
                            <span className="text-base font-black text-slate-900">
                              Tháng {inv.month_year}
                            </span>
                            {inv.short_code && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-bold rounded-lg bg-primary-50 text-primary-700 border border-primary-200">
                                {inv.short_code}
                              </span>
                            )}

                            {isOvercharged ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700 border border-red-300">
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span>Thu lố {Number(inv.diff_amount).toLocaleString('vi-VN')} đ</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Chuẩn quy định</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            Mã hóa đơn #{inv.id} {inv.short_code ? `• Mã tra cứu: ${inv.short_code}` : ''} • Chốt ngày{' '}
                            {inv.created_at ? new Date(inv.created_at).toLocaleDateString('vi-VN') : 'Gần đây'}
                          </p>
                        </div>

                        {/* Breakdown Numbers & Action Buttons */}
                        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-3 text-xs mt-3 lg:mt-0">
                          {/* Điện */}
                          <div className="px-3 py-2 bg-white rounded-xl border border-slate-200 flex flex-col justify-center">
                            <span className="text-slate-400 block text-[10px]">Điện ({inv.elec_kwh} kWh)</span>
                            <span className="font-bold text-slate-800">
                              {Number(inv.elec_amount).toLocaleString('vi-VN')} đ
                            </span>
                          </div>

                          {/* Nước */}
                          <div className="px-3 py-2 bg-white rounded-xl border border-slate-200 flex flex-col justify-center">
                            <span className="text-slate-400 block text-[10px]">Nước ({inv.water_usage} m³)</span>
                            <span className="font-bold text-slate-800">
                              {Number(inv.water_amount).toLocaleString('vi-VN')} đ
                            </span>
                          </div>

                          {/* Tổng luật định */}
                          <div className="px-3 py-2 bg-emerald-50 rounded-xl border border-emerald-200 flex flex-col justify-center">
                            <span className="text-emerald-700 block text-[10px] font-bold">Tổng quy định</span>
                            <span className="font-black text-emerald-900">
                              {Number(inv.total_statutory_amount).toLocaleString('vi-VN')} đ
                            </span>
                          </div>

                          {/* Tiền thực thu */}
                          <div className="px-3 py-2 bg-slate-100 rounded-xl border border-slate-200 flex flex-col justify-center">
                            <span className="text-slate-500 block text-[10px]">Tiền thực thu</span>
                            <span className="font-black text-slate-900">
                              {Number(inv.actual_collected_amount).toLocaleString('vi-VN')} đ
                            </span>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 col-span-2 sm:col-span-1 mt-2 sm:mt-0 w-full sm:w-auto">
                            {inv.short_code && (
                              <button
                                onClick={() => handleCopy(inv.short_code, `sc-${inv.id}`)}
                                className="min-h-[44px] flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 text-xs font-semibold rounded-xl transition-all"
                                title="Sao chép mã tra cứu"
                              >
                                {copiedToken === `sc-${inv.id}` ? (
                                  <Check className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                                <span>{copiedToken === `sc-${inv.id}` ? 'Đã chép' : `Mã: ${inv.short_code}`}</span>
                              </button>
                            )}

                            {inv.share_token && (
                              <button
                                onClick={() => onViewPublicInvoice?.(inv.share_token)}
                                className="min-h-[44px] flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-800 text-xs font-bold rounded-xl border border-slate-200 shadow-sm transition-all"
                              >
                                <ExternalLink className="w-4 h-4 text-primary-600" />
                                <span>Chi tiết & In</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Overcharged brief notice */}
                      {isOvercharged && (
                        <div className="mt-3 pt-2.5 border-t border-red-200 text-xs text-red-800 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                          <span>
                            Số tiền thực thu cao hơn giá định mức nhà nước <strong>{Number(inv.diff_amount).toLocaleString('vi-VN')} đ</strong>.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Tham gia phòng khác */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-4 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 animate-scale-in max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-1">Tham gia phòng trọ mới</h3>
            <p className="text-xs text-slate-500 mb-4">
              Nhập mã mời phòng do chủ trọ cung cấp để liên kết tài khoản của bạn vào phòng.
            </p>

            {joinError && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                  Mã mời phòng (Invite Code) *
                </label>
                <input
                  type="text"
                  required
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                  placeholder="Ví dụ: AB3K9X1Z"
                  className="min-h-[44px] h-12 w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm font-mono uppercase tracking-wider text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinModal(false);
                    setJoinError(null);
                  }}
                  className="min-h-[44px] w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all flex items-center justify-center"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={joining}
                  className="min-h-[44px] w-full sm:w-auto px-6 py-2.5 bg-primary-600 hover:bg-primary-700 active:scale-[0.98] text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  {joining ? 'Đang kết nối...' : 'Xác nhận tham gia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Cấu hình số người định mức (Yêu cầu xác thực kép) */}
      {showOccupancyModal && selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-4 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 sm:space-y-5 animate-scale-in max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center font-bold">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Cấu hình số người định mức</h3>
                  <p className="text-xs text-slate-500">Phòng {selectedRoom.room_number} • Xác thực kép</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOccupancyModal(false)}
                className="text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl"
              >
                ✕
              </button>
            </div>

            {occupancyError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{occupancyError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitOccupancyRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Số người hiện tại:
                </label>
                <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl text-xs font-bold text-slate-700">
                  {selectedRoom.current_people_count} người
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Số người mới thực tế ở phòng: <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={occupancyForm.new_people_count}
                  onChange={(e) => setOccupancyForm({ ...occupancyForm, new_people_count: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ngày bắt đầu áp dụng: <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={occupancyForm.effective_date}
                  onChange={(e) => setOccupancyForm({ ...occupancyForm, effective_date: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Nếu thay đổi giữa tháng, tiền điện sẽ tự động phân bổ định mức theo tỷ lệ số ngày thực tế trong tháng (Thông tư 60/2025/TT-BCT).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lý do / Ghi chú (tùy chọn):
                </label>
                <textarea
                  rows="2"
                  value={occupancyForm.note}
                  onChange={(e) => setOccupancyForm({ ...occupancyForm, note: e.target.value })}
                  placeholder="Ví dụ: Bạn mới chuyển vào từ giữa tháng..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-primary-600" />
                  <span>Mật khẩu tài khoản cá nhân: <span className="text-red-500">*</span></span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Nhập mật khẩu để xác thực yêu cầu"
                  value={occupancyForm.password}
                  onChange={(e) => setOccupancyForm({ ...occupancyForm, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowOccupancyModal(false)}
                  className="min-h-[44px] px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={occupancySubmitting}
                  className="min-h-[44px] px-5 py-2.5 bg-primary-600 hover:bg-primary-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {occupancySubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Gửi yêu cầu xác thực kép</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Từ chối đề xuất đổi số người */}
      {rejectModalReq && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-4 sm:p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4 animate-scale-in max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <h3 className="text-sm font-black text-slate-900">Từ chối đề xuất đổi số người</h3>
            <p className="text-xs text-slate-500">
              Bạn có chắc muốn từ chối đề xuất đổi sang {rejectModalReq.new_people_count} người từ chủ trọ?
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lý do từ chối (tùy chọn):
              </label>
              <textarea
                rows="2"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Nhập lý do..."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalReq(null)}
                className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={rejecting}
                onClick={handleRejectRequest}
                className="min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center gap-1"
              >
                {rejecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Xác nhận từ chối</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
