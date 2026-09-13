/*
 * Copyright (c) 2026 tro. Contributors
 * SPDX-License-Identifier: MIT
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { properties as propApi, rooms as roomApi, invoices as invoiceApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useTariff } from '../context/TariffContext';
import { useRealtimeEvent } from '../context/WebSocketContext';
import {
  Building2,
  Plus,
  Home,
  Users,
  Copy,
  Check,
  Calculator,
  UserX,
  UserPlus,
  User,
  Phone,
  Scale,
  FileText,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  SlidersHorizontal,
  Send,
  Printer,
  Bookmark,
  Trash2,
  Lock,
  Clock,
  Edit3,
  X,
  Loader2,
} from 'lucide-react';

export default function LandlordDashboard({ onViewPublicInvoice }) {
  const { toast } = useToast();
  const {
    tariffConfig,
    maxTierPrice,
    fallbackTierNumber,
    fallbackTierPrice,
    complianceDecree,
    penaltyText,
  } = useTariff();
  const [propertiesList, setPropertiesList] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [roomsList, setRoomsList] = useState([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Modals / sub-views
  const [showAddPropModal, setShowAddPropModal] = useState(false);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [showTariffConfigModal, setShowTariffConfigModal] = useState(false);
  const [assignModalRoom, setAssignModalRoom] = useState(null);
  const [assignInput, setAssignInput] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState(null);
  const [calcModalRoom, setCalcModalRoom] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);
  const [publishing, setPublishing] = useState(false);

  // Room Invoices History Modal
  const [historyModalRoom, setHistoryModalRoom] = useState(null);
  const [roomInvoicesList, setRoomInvoicesList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Property Deletion state
  const [showDeletePropModal, setShowDeletePropModal] = useState(false);
  const [deletePropPassword, setDeletePropPassword] = useState('');
  const [deletePropLoading, setDeletePropLoading] = useState(false);
  const [deletePropError, setDeletePropError] = useState(null);

  // Room Deletion state
  const [deleteRoomModal, setDeleteRoomModal] = useState(null);
  const [deleteRoomPassword, setDeleteRoomPassword] = useState('');
  const [deleteRoomLoading, setDeleteRoomLoading] = useState(false);
  const [deleteRoomError, setDeleteRoomError] = useState(null);

  // Occupancy Change & Dual-Approval state
  const [occupancyRequestsMap, setOccupancyRequestsMap] = useState({});
  const [occupancyModalRoom, setOccupancyModalRoom] = useState(null);
  const [occupancyForm, setOccupancyForm] = useState({
    new_people_count: 1,
    effective_date: new Date().toISOString().split('T')[0],
    note: '',
    password: '',
  });
  const [occupancySubmitting, setOccupancySubmitting] = useState(false);
  const [occupancyError, setOccupancyError] = useState(null);

  // Rejection modal state
  const [rejectModalReq, setRejectModalReq] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [highlightRoomId, setHighlightRoomId] = useState(null);

  // Forms
  const [propForm, setPropForm] = useState({ name: '', address: '' });
  const [roomForm, setRoomForm] = useState({ room_number: '', current_people_count: 1 });
  const [tariffConfigForm, setTariffConfigForm] = useState({
    tariff_type: 'statutory',
    custom_elec_rate: 3500,
    custom_water_rate: 20000,
    custom_water_type: 'PER_M3',
  });

  const [calcForm, setCalcForm] = useState({
    month_year: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    elec_start: '',
    elec_end: '',
    water_start: '',
    water_end: '',
    elec_method: 'TIERED',
    actual_collected_amount: '',
  });
  const [calcResult, setCalcResult] = useState(null);
  const [calculating, setCalculating] = useState(false);

  // Inline meter validations: end must be >= start
  const isElecInvalid = useMemo(() => {
    if (calcForm.elec_start === '' || calcForm.elec_end === '') return false;
    const start = parseFloat(calcForm.elec_start);
    const end = parseFloat(calcForm.elec_end);
    return !isNaN(start) && !isNaN(end) && end < start;
  }, [calcForm.elec_start, calcForm.elec_end]);

  const isWaterInvalid = useMemo(() => {
    if (calcForm.water_start === '' || calcForm.water_end === '') return false;
    const start = parseFloat(calcForm.water_start);
    const end = parseFloat(calcForm.water_end);
    return !isNaN(start) && !isNaN(end) && end < start;
  }, [calcForm.water_start, calcForm.water_end]);

  // Load properties
  const fetchProperties = useCallback(async () => {
    setLoadingProps(true);
    try {
      const data = await propApi.list();
      setPropertiesList(data || []);
      if (data && data.length > 0) {
        setSelectedProperty((prev) => prev || data[0]);
      }
    } catch (err) {
      toast.error(err.message || 'Không thể tải danh sách khu trọ');
    } finally {
      setLoadingProps(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  // Load rooms for selected property
  const fetchRooms = useCallback(
    async (propertyId) => {
      if (!propertyId) return;
      setLoadingRooms(true);
      try {
        const data = await propApi.getRooms(propertyId);
        const rooms = data || [];
        setRoomsList(rooms);

        // Fetch occupancy change requests for each room in parallel
        if (rooms.length > 0) {
          try {
            const reqArrays = await Promise.all(
              rooms.map((r) => roomApi.getOccupancyRequests(r.id).catch(() => []))
            );
            const map = {};
            rooms.forEach((r, idx) => {
              map[r.id] = reqArrays[idx] || [];
            });
            setOccupancyRequestsMap(map);
          } catch {
            // ignore
          }
        } else {
          setOccupancyRequestsMap({});
        }
      } catch (err) {
        toast.error(err.message || 'Không thể tải danh sách phòng');
      } finally {
        setLoadingRooms(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (selectedProperty?.id) {
      fetchRooms(selectedProperty.id);
    }
  }, [selectedProperty, fetchRooms]);

  // Focus and scroll to room when clicking on notification
  useEffect(() => {
    const handleFocusRoom = async (e) => {
      const { roomId } = e.detail || {};
      if (!roomId) return;

      const found = roomsList.some((r) => r.id === roomId);
      if (found) {
        setHighlightRoomId(roomId);
        setTimeout(() => {
          const el = document.getElementById(`room-card-${roomId}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
        setTimeout(() => setHighlightRoomId(null), 4000);
        return;
      }

      for (const p of propertiesList) {
        if (p.id === selectedProperty?.id) continue;
        try {
          const rList = await propApi.getRooms(p.id);
          if (rList.some((r) => r.id === roomId)) {
            setSelectedProperty(p);
            setHighlightRoomId(roomId);
            setTimeout(() => {
              const el = document.getElementById(`room-card-${roomId}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 350);
            setTimeout(() => setHighlightRoomId(null), 4000);
            break;
          }
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('tro:focus_room', handleFocusRoom);
    return () => window.removeEventListener('tro:focus_room', handleFocusRoom);
  }, [roomsList, propertiesList, selectedProperty]);

  // Realtime WebSocket listeners
  useRealtimeEvent('TENANT_JOINED', (data) => {
    toast.info(`Khách thuê ${data?.tenant_name || ''} vừa nhận phòng ${data?.room_number || ''}!`);
    if (selectedProperty?.id) {
      fetchRooms(selectedProperty.id);
    }
  });

  useRealtimeEvent('ROOM_UPDATED', () => {
    if (selectedProperty?.id) {
      fetchRooms(selectedProperty.id);
    }
  });

  useRealtimeEvent('INVOICE_PAID', () => {
    toast.success('Có hóa đơn vừa được thanh toán!');
    if (selectedProperty?.id) {
      fetchRooms(selectedProperty.id);
    }
  });

  useRealtimeEvent('QUOTA_REQUEST_CREATED', (data) => {
    toast.info(`Phòng ${data?.room_number || ''}: Có đề xuất đổi số người định mức!`);
    if (selectedProperty?.id) {
      fetchRooms(selectedProperty.id);
    }
  });

  useRealtimeEvent('QUOTA_REQUEST_APPROVED', (data) => {
    toast.success(`Đề xuất đổi số người cho Phòng ${data?.room_number || ''} đã được duyệt!`);
    if (selectedProperty?.id) {
      fetchRooms(selectedProperty.id);
    }
  });

  useRealtimeEvent('QUOTA_REQUEST_REJECTED', (data) => {
    toast.warning(`Đề xuất đổi số người cho Phòng ${data?.room_number || ''} đã bị từ chối.`);
    if (selectedProperty?.id) {
      fetchRooms(selectedProperty.id);
    }
  });

  useRealtimeEvent('ROOM_DELETED', () => {
    if (selectedProperty?.id) {
      fetchRooms(selectedProperty.id);
    }
  });

  useRealtimeEvent('PROPERTY_DELETED', () => {
    fetchProperties();
  });

  // Handlers for Deletion & Occupancy Change
  const handleOpenDeletePropModal = () => {
    if (!selectedProperty) return;
    const occupied = roomsList.filter((r) => r.status === 'occupied' || r.status === 'active' || r.tenant_id != null);
    if (occupied.length > 0) {
      toast.warning(`Khu trọ còn ${occupied.length} phòng đang có khách (${occupied.map(r => r.room_number).join(', ')}). Vui lòng trả phòng cho tất cả khách trước khi xóa khu trọ.`);
      return;
    }
    setDeletePropPassword('');
    setDeletePropError(null);
    setShowDeletePropModal(true);
  };

  const handleConfirmDeleteProp = async (e) => {
    e.preventDefault();
    if (!selectedProperty || !deletePropPassword) {
      setDeletePropError('Vui lòng nhập mật khẩu chủ trọ để xác thực.');
      return;
    }
    setDeletePropLoading(true);
    setDeletePropError(null);
    try {
      await propApi.delete(selectedProperty.id, deletePropPassword);
      toast.success(`Đã xóa khu trọ "${selectedProperty.name}" thành công!`);
      setShowDeletePropModal(false);
      const remainingProps = propertiesList.filter((p) => p.id !== selectedProperty.id);
      setPropertiesList(remainingProps);
      setSelectedProperty(remainingProps[0] || null);
    } catch (err) {
      setDeletePropError(err.message || 'Không thể xóa khu trọ. Vui lòng kiểm tra lại mật khẩu hoặc đảm bảo các phòng đều trống.');
    } finally {
      setDeletePropLoading(false);
    }
  };

  const handleOpenDeleteRoomModal = (room) => {
    const isOccupied = room.status === 'occupied' || room.status === 'active' || room.tenant_id != null;
    if (isOccupied) {
      toast.warning(`Phòng ${room.room_number} đang có khách thuê. Vui lòng bấm "Trả phòng" trước khi xóa.`);
      return;
    }
    setDeleteRoomModal(room);
    setDeleteRoomPassword('');
    setDeleteRoomError(null);
  };

  const handleConfirmDeleteRoom = async (e) => {
    e.preventDefault();
    if (!deleteRoomModal || !deleteRoomPassword) {
      setDeleteRoomError('Vui lòng nhập mật khẩu chủ trọ để xác thực.');
      return;
    }
    setDeleteRoomLoading(true);
    setDeleteRoomError(null);
    try {
      await roomApi.delete(deleteRoomModal.id, deleteRoomPassword);
      toast.success(`Đã xóa Phòng ${deleteRoomModal.room_number} thành công!`);
      setRoomsList((prev) => prev.filter((r) => r.id !== deleteRoomModal.id));
      setDeleteRoomModal(null);
    } catch (err) {
      setDeleteRoomError(err.message || 'Không thể xóa phòng. Vui lòng kiểm tra lại mật khẩu.');
    } finally {
      setDeleteRoomLoading(false);
    }
  };

  const handleOpenOccupancyModal = (room) => {
    setOccupancyModalRoom(room);
    setOccupancyForm({
      new_people_count: room.current_people_count || 1,
      effective_date: new Date().toISOString().split('T')[0],
      note: '',
      password: '',
    });
    setOccupancyError(null);
  };

  const handleSubmitOccupancyProposal = async (e) => {
    e.preventDefault();
    if (!occupancyModalRoom || !occupancyForm.password) {
      setOccupancyError('Vui lòng nhập mật khẩu chủ trọ để xác thực đề xuất.');
      return;
    }
    setOccupancySubmitting(true);
    setOccupancyError(null);
    try {
      await roomApi.requestOccupancyChange(occupancyModalRoom.id, {
        new_people_count: parseInt(occupancyForm.new_people_count, 10),
        effective_date: occupancyForm.effective_date,
        note: occupancyForm.note || null,
        password: occupancyForm.password,
      });
      toast.success(`Đã gửi đề xuất đổi số người cho Phòng ${occupancyModalRoom.room_number}! Chờ khách thuê xác nhận kép.`);
      setOccupancyModalRoom(null);
      if (selectedProperty?.id) fetchRooms(selectedProperty.id);
    } catch (err) {
      setOccupancyError(err.message || 'Không thể tạo đề xuất. Vui lòng kiểm tra lại mật khẩu.');
    } finally {
      setOccupancySubmitting(false);
    }
  };

  const handleLandlordApprove = async (requestId, roomNumber) => {
    try {
      await roomApi.approveOccupancyRequest(requestId);
      toast.success(`Đã phê duyệt số người mới cho Phòng ${roomNumber}!`);
      if (selectedProperty?.id) fetchRooms(selectedProperty.id);
    } catch (err) {
      toast.error(err.message || 'Không thể phê duyệt yêu cầu.');
    }
  };

  const handleLandlordReject = async () => {
    if (!rejectModalReq) return;
    setRejecting(true);
    try {
      await roomApi.rejectOccupancyRequest(rejectModalReq.id, rejectReason);
      toast.info('Đã từ chối yêu cầu đổi số người.');
      setRejectModalReq(null);
      setRejectReason('');
      if (selectedProperty?.id) fetchRooms(selectedProperty.id);
    } catch (err) {
      toast.error(err.message || 'Không thể từ chối yêu cầu.');
    } finally {
      setRejecting(false);
    }
  };

  // Handlers for Property & Rooms
  const handleCreateProperty = async (e) => {
    e.preventDefault();
    if (!propForm.name.trim()) return;
    try {
      const created = await propApi.create({
        name: propForm.name.trim(),
        address: propForm.address.trim() || undefined,
        tariff_type: 'statutory',
      });
      setPropForm({ name: '', address: '' });
      setShowAddPropModal(false);
      setPropertiesList((prev) => [...prev, created]);
      setSelectedProperty(created);
      toast.success(`Đã thêm khu trọ "${created.name}"`);
    } catch (err) {
      toast.error(err.message || 'Không thể tạo khu trọ');
    }
  };

  const handleOpenTariffConfig = () => {
    if (!selectedProperty) return;
    setTariffConfigForm({
      tariff_type: selectedProperty.tariff_type || 'statutory',
      custom_elec_rate: selectedProperty.custom_elec_rate || 3500,
      custom_water_rate: selectedProperty.custom_water_rate || 20000,
      custom_water_type: selectedProperty.custom_water_type || 'PER_M3',
    });
    setShowTariffConfigModal(true);
  };

  const handleSavePropertyTariff = async (e) => {
    e.preventDefault();
    if (!selectedProperty?.id) return;
    try {
      const isCustom = tariffConfigForm.tariff_type === 'custom';
      const updated = await propApi.update(selectedProperty.id, {
        tariff_type: tariffConfigForm.tariff_type,
        custom_elec_rate: isCustom ? Number(tariffConfigForm.custom_elec_rate) : null,
        custom_water_rate: isCustom ? Number(tariffConfigForm.custom_water_rate) : null,
        custom_water_type: isCustom ? tariffConfigForm.custom_water_type : 'PER_M3',
      });
      setSelectedProperty(updated);
      setPropertiesList((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setShowTariffConfigModal(false);
      toast.success(`Đã lưu cấu hình biểu giá cho "${updated.name}"`);
    } catch (err) {
      toast.error(err.message || 'Không thể lưu biểu giá khu trọ');
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!selectedProperty?.id || !roomForm.room_number.trim()) return;
    try {
      const created = await propApi.createRoom(selectedProperty.id, {
        room_number: roomForm.room_number.trim(),
        current_people_count: Number(roomForm.current_people_count) || 1,
      });
      setRoomForm({ room_number: '', current_people_count: 1 });
      setShowAddRoomModal(false);
      setRoomsList((prev) => [...prev, created]);
      toast.success(`Đã tạo phòng ${created.room_number}`);
    } catch (err) {
      toast.error(err.message || 'Không thể tạo phòng mới');
    }
  };

  const handleRemoveTenant = async (roomId, roomNumber) => {
    if (!window.confirm(`Xác nhận trả phòng cho Phòng ${roomNumber}? Mã mời phòng sẽ được cấp mới.`)) {
      return;
    }
    try {
      const updated = await propApi.removeTenant(selectedProperty.id, roomId);
      setRoomsList((prev) => prev.map((r) => (r.id === roomId ? updated : r)));
      toast.success(`Đã đặt lại trạng thái phòng ${roomNumber} sang TRỐNG`);
    } catch (err) {
      toast.error(err.message || 'Không thể xóa khách thuê');
    }
  };

  const handleAssignTenant = async (e) => {
    e.preventDefault();
    if (!assignModalRoom || !selectedProperty?.id) return;
    const val = assignInput.trim();
    if (!val) {
      setAssignError('Vui lòng nhập Username hoặc Số điện thoại của người thuê.');
      return;
    }
    setAssignLoading(true);
    setAssignError(null);
    try {
      const isPhone = /^[0-9+\s()-]+$/.test(val);
      const payload = isPhone ? { phone: val } : { username: val.replace(/^@/, '') };
      const updated = await propApi.assignTenant(selectedProperty.id, assignModalRoom.id, payload);
      setRoomsList((prev) => prev.map((r) => (r.id === assignModalRoom.id ? updated : r)));
      toast.success(`Đã gán khách thuê vào Phòng ${assignModalRoom.room_number}`);
      setAssignModalRoom(null);
      setAssignInput('');
    } catch (err) {
      setAssignError(err.message || 'Không thể gán khách thuê vào phòng.');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleCopy = (text, key) => {
    navigator.clipboard?.writeText(text);
    setCopiedToken(key);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  // Open calculation modal
  const handleOpenCalcModal = (room) => {
    setCalcModalRoom(room);
    setCalcResult(null);

    // Pre-populate actual collected if property has custom rate
    let prefilledRate = '';
    if (selectedProperty?.tariff_type === 'custom' && selectedProperty.custom_elec_rate) {
      prefilledRate = '';
    }

    setCalcForm({
      month_year: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
      elec_start: '',
      elec_end: '',
      water_start: '',
      water_end: '',
      elec_method: 'TIERED',
      actual_collected_amount: prefilledRate,
    });
  };

  // Live calculation estimation for Compliance Alert inside form
  const liveFormCompliance = useMemo(() => {
    const eStart = parseFloat(calcForm.elec_start);
    const eEnd = parseFloat(calcForm.elec_end);
    const wStart = parseFloat(calcForm.water_start);
    const wEnd = parseFloat(calcForm.water_end);
    const actualEntered = parseFloat(calcForm.actual_collected_amount);

    if (isNaN(eStart) || isNaN(eEnd) || eEnd < eStart) return null;

    const eKwh = eEnd - eStart;
    const wM3 = !isNaN(wStart) && !isNaN(wEnd) && wEnd >= wStart ? wEnd - wStart : 0;

    // Approximate Tier 3 statutory rate ~ 2380 * 1.08 = 2570 VND
    const approxStatutoryElec = eKwh * 2570;
    const approxStatutoryWater = wM3 * 8500 * 1.15;
    const approxStatutoryTotal = Math.round(approxStatutoryElec + approxStatutoryWater);

    let actualEst = isNaN(actualEntered) ? null : actualEntered;
    if (actualEst === null && selectedProperty?.tariff_type === 'custom' && selectedProperty.custom_elec_rate) {
      actualEst = Math.round(eKwh * selectedProperty.custom_elec_rate + wM3 * (selectedProperty.custom_water_rate || 8500));
    }

    if (actualEst !== null && actualEst > approxStatutoryTotal) {
      return {
        isOvercharged: true,
        diff: actualEst - approxStatutoryTotal,
        approxStatutoryTotal,
        actualEst,
      };
    }
    return null;
  }, [calcForm, selectedProperty]);

  const handleCalculateInvoice = async (e) => {
    e.preventDefault();
    if (!calcModalRoom) return;

    if (isElecInvalid) {
      toast.error('Chỉ số điện cuối không được nhỏ hơn chỉ số đầu.');
      return;
    }
    if (isWaterInvalid) {
      toast.error('Chỉ số nước cuối không được nhỏ hơn chỉ số đầu.');
      return;
    }

    setCalculating(true);
    setCalcResult(null);
    try {
      const elecStart = parseFloat(calcForm.elec_start);
      const elecEnd = parseFloat(calcForm.elec_end);
      const waterStart = parseFloat(calcForm.water_start);
      const waterEnd = parseFloat(calcForm.water_end);

      if (isNaN(elecStart) || isNaN(elecEnd)) {
        throw new Error('Vui lòng nhập chỉ số điện đầu và cuối hợp lệ.');
      }
      if (isNaN(waterStart) || isNaN(waterEnd)) {
        throw new Error('Vui lòng nhập chỉ số nước đầu và cuối hợp lệ.');
      }
      if (elecEnd < elecStart) {
        throw new Error('Chỉ số điện cuối không được nhỏ hơn chỉ số đầu.');
      }
      if (waterEnd < waterStart) {
        throw new Error('Chỉ số nước cuối không được nhỏ hơn chỉ số đầu.');
      }

      const isTier3 = calcForm.elec_method === 'TIER3';
      const actualCollected =
        calcForm.actual_collected_amount !== '' &&
        !isNaN(parseFloat(calcForm.actual_collected_amount))
          ? parseFloat(calcForm.actual_collected_amount)
          : undefined;

      const payload = {
        month_year: calcForm.month_year.trim(),
        elec_start: elecStart,
        elec_end: elecEnd,
        water_start: waterStart,
        water_end: waterEnd,
        use_tier3: isTier3,
        has_registered_quota: !isTier3,
        people_count: Number(calcModalRoom.current_people_count) || 1,
        actual_collected_amount: actualCollected,
      };

      const result = await roomApi.calculateInvoice(calcModalRoom.id, payload);
      setCalcResult(result);
      toast.success(`Đã lập bản nháp hóa đơn phòng ${calcModalRoom.room_number}`);
    } catch (err) {
      toast.error(err.message || 'Lỗi khi tính toán hóa đơn');
    } finally {
      setCalculating(false);
    }
  };

  // Publish Draft Invoice
  const handlePublishInvoice = async (invoiceId) => {
    setPublishing(true);
    try {
      const updated = await invoiceApi.publish(invoiceId);
      if (calcResult && calcResult.id === invoiceId) {
        setCalcResult(updated);
      }
      // If room history is open, update item in history
      setRoomInvoicesList((prev) =>
        prev.map((inv) => (inv.id === invoiceId ? updated : inv))
      );
      toast.success('Đã phát hành và gửi hóa đơn cho người thuê thành công!');
    } catch (err) {
      toast.error(err.message || 'Không thể phát hành hóa đơn');
    } finally {
      setPublishing(false);
    }
  };

  // Open Room Invoices History
  const handleOpenHistoryModal = async (room) => {
    setHistoryModalRoom(room);
    setLoadingHistory(true);
    try {
      const invs = await roomApi.getInvoices(room.id);
      setRoomInvoicesList(invs || []);
    } catch (err) {
      toast.error(err.message || 'Không thể tải lịch sử hóa đơn phòng');
      setRoomInvoicesList([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Quản lý Phòng trọ
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Lập hóa đơn bản nháp, đối chiếu tuân thủ định mức và phát hành minh bạch
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowAddPropModal(true)}
            className="min-h-[44px] flex items-center gap-1.5 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm khu trọ</span>
          </button>
        </div>
      </div>

      {/* Property Selector Tabs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Home className="w-5 h-5 text-primary-600" />
            <span>Danh sách Khu trọ ({propertiesList.length})</span>
          </h2>
          <button
            onClick={fetchProperties}
            title="Làm mới"
            aria-label="Làm mới danh sách khu trọ"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loadingProps ? (
          <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none sm:scrollbar-thin animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="min-w-[200px] h-[58px] bg-slate-100 rounded-2xl border border-slate-200 p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-slate-200 flex-shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 bg-slate-200 rounded w-24" />
                  <div className="h-2.5 bg-slate-200 rounded w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : propertiesList.length === 0 ? (
          <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-white">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">Chưa có khu trọ nào</p>
            <p className="text-xs text-slate-400 mt-1 mb-4">Bấm nút bên dưới để tạo khu trọ đầu tiên của bạn</p>
            <button
              onClick={() => setShowAddPropModal(true)}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo khu trọ ngay</span>
            </button>
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none sm:scrollbar-thin pr-8 sm:pr-0">
              {propertiesList.map((p) => {
                const active = selectedProperty?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProperty(p)}
                    className={`min-h-[44px] px-4 py-3 rounded-2xl border text-left whitespace-nowrap transition-all flex items-center gap-3 ${
                      active
                        ? 'border-primary-600 bg-primary-50/70 text-primary-950 ring-2 ring-primary-500/20 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                        active ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      #{p.id}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{p.name}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[180px]">{p.address || 'Không có địa chỉ'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-slate-50 to-transparent sm:hidden" />
          </div>
        )}
      </div>

      {/* Selected Property Details & Rooms */}
      {selectedProperty && (
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200/80 p-3.5 sm:p-8 space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h3 className="text-lg sm:text-xl font-black text-slate-900">{selectedProperty.name}</h3>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">
                  {roomsList.length} phòng
                </span>
                {/* Property Tariff Badge */}
                {selectedProperty.tariff_type === 'custom' ? (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                    Đơn giá riêng ({selectedProperty.custom_elec_rate?.toLocaleString('vi-VN')} đ/kWh)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200" title={tariffConfig?.tariff_version || 'QD-1279-2023'}>
                    Biểu giá Nhà nước{tariffConfig?.tariff_version ? ` · ${tariffConfig.tariff_version}` : ''}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {selectedProperty.address || 'Chưa cập nhật địa chỉ khu trọ'}
              </p>
            </div>

            <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                onClick={handleOpenTariffConfig}
                className="min-h-[38px] sm:min-h-[44px] flex items-center justify-center gap-1 px-2 sm:px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                title="Cấu hình biểu giá áp dụng cho khu trọ này"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
                <span className="truncate">Biểu giá</span>
              </button>

              <button
                onClick={() => setShowAddRoomModal(true)}
                className="min-h-[38px] sm:min-h-[44px] flex items-center justify-center gap-1 px-2 sm:px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">Thêm phòng</span>
              </button>

              <button
                onClick={handleOpenDeletePropModal}
                className="min-h-[38px] sm:min-h-[44px] flex items-center justify-center gap-1 px-2 sm:px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold rounded-xl transition-all"
                title="Xóa khu trọ này (yêu cầu tất cả các phòng phải trống)"
              >
                <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">Xóa khu</span>
              </button>
            </div>
          </div>

          {/* Rooms Grid */}
          {loadingRooms ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="h-5 bg-slate-200 rounded w-28" />
                    <div className="h-5 bg-slate-200 rounded-full w-20" />
                  </div>
                  <div className="space-y-2 py-2">
                    <div className="h-3 bg-slate-200 rounded w-3/4" />
                    <div className="h-10 bg-slate-100 rounded-xl" />
                  </div>
                  <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                    <div className="h-10 bg-slate-200 rounded-xl flex-1" />
                    <div className="h-10 bg-slate-200 rounded-xl w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : roomsList.length === 0 ? (
            <div className="p-10 border-2 border-dashed border-slate-200 rounded-2xl text-center">
              <Home className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Khu trọ này chưa có phòng nào</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">Hãy thêm phòng để quản lý chỉ số điện nước</p>
              <button
                onClick={() => setShowAddRoomModal(true)}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm phòng đầu tiên</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {roomsList.map((room) => {
                const isOccupied = room.status === 'occupied' || room.status === 'active' || room.tenant_id != null;
                return (
                  <div
                    key={room.id}
                    id={`room-card-${room.id}`}
                    className={`p-3.5 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 sm:space-y-4 ${
                      highlightRoomId === room.id
                        ? 'ring-4 ring-primary-500 ring-offset-2 scale-[1.01] shadow-lg'
                        : ''
                    } ${
                      isOccupied
                        ? 'border-emerald-300/90 bg-gradient-to-b from-emerald-50/40 via-white to-white shadow-xs hover:border-emerald-400 hover:shadow-md'
                        : 'border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div>
                      {/* Room Header */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-lg font-black text-slate-900">Phòng {room.room_number}</span>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full ${
                            isOccupied
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isOccupied ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'
                            }`}
                          />
                          {isOccupied ? 'Đang thuê' : 'Phòng trống'}
                        </span>
                      </div>

                      {/* Room Details */}
                      <div className="space-y-2 text-xs text-slate-600">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <Users className="w-3.5 h-3.5" />
                            <span>Định mức:</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{room.current_people_count} người</span>
                            <button
                              onClick={() => handleOpenOccupancyModal(room)}
                              className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2 py-1 rounded-lg border border-primary-200 inline-flex items-center gap-1 transition-all"
                              title="Đề xuất thay đổi số người định mức (cần khách duyệt kép)"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Đổi số người</span>
                            </button>
                          </div>
                        </div>

                        {/* Dual-Approval Pending Request Block for Room */}
                        {(() => {
                          const roomReqs = occupancyRequestsMap[room.id] || [];
                          const pendingReq = roomReqs.find((r) => r.status === 'pending');
                          if (!pendingReq) return null;

                          if (pendingReq.requested_by_role === 'tenant') {
                            return (
                              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-xs">
                                <div className="flex items-start gap-1.5 text-amber-900">
                                  <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-bold">Khách thuê yêu cầu đổi số người:</p>
                                    <p className="text-amber-800">
                                      Từ {pendingReq.old_people_count} &rarr; <strong>{pendingReq.new_people_count} người</strong> (áp dụng từ {pendingReq.effective_date})
                                    </p>
                                    {pendingReq.note && (
                                      <p className="text-[11px] text-slate-500 italic mt-0.5">"{pendingReq.note}"</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 pt-1 border-t border-amber-200/60 justify-end">
                                  <button
                                    onClick={() => {
                                      setRejectModalReq(pendingReq);
                                      setRejectReason('');
                                    }}
                                    className="min-h-[32px] px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg transition-colors"
                                  >
                                    Từ chối
                                  </button>
                                  <button
                                    onClick={() => handleLandlordApprove(pendingReq.id, room.room_number)}
                                    className="min-h-[32px] px-3 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors flex items-center gap-1"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Chấp thuận</span>
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-blue-900">
                                <Clock className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                <span>Đề xuất: <strong>{pendingReq.new_people_count} người</strong> (chờ khách duyệt)</span>
                              </div>
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-200/80 text-blue-800">
                                Chờ duyệt
                              </span>
                            </div>
                          );
                        })()}

                        {/* Occupied room: display tenant details */}
                        {isOccupied ? (
                          <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100/90 space-y-1.5">
                            <div className="flex items-center justify-between text-slate-700">
                              <span className="flex items-center gap-1 text-slate-500">
                                <User className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Khách thuê:</span>
                              </span>
                              <span className="font-bold text-slate-900">
                                {room.tenant_name || `ID #${room.tenant_id}`}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-700">
                              <span className="flex items-center gap-1 text-slate-500">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                <span>Số điện thoại:</span>
                              </span>
                              <span className="font-medium text-slate-800">
                                {room.tenant_phone || 'Chưa cập nhật SĐT'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between py-1">
                            <span className="text-slate-500 font-medium">Mã mời phòng:</span>
                            <button
                              onClick={() => handleCopy(room.invite_code, `invite-${room.id}`)}
                              title="Sao chép mã mời"
                              className="inline-flex items-center gap-1.5 min-h-[44px] font-mono font-bold text-primary-700 hover:text-primary-800 bg-primary-50 hover:bg-primary-100 px-3 py-2 rounded-xl border border-primary-200 transition-all text-xs"
                            >
                              <span>{room.invite_code}</span>
                              {copiedToken === `invite-${room.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenCalcModal(room)}
                          className="flex-1 min-h-[38px] sm:min-h-[44px] flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                          <span>Tính hóa đơn</span>
                        </button>

                        <button
                          onClick={() => handleOpenHistoryModal(room)}
                          title="Xem lịch sử hóa đơn phòng này"
                          className="min-h-[38px] sm:min-h-[44px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5 text-slate-500" />
                          <span>Lịch sử</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-0.5">
                        {isOccupied ? (
                          <button
                            onClick={() => handleRemoveTenant(room.id, room.room_number)}
                            title="Trả phòng & Đổi mã mời mới"
                            className="min-h-[36px] px-2 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg flex items-center gap-1 font-medium transition-colors"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Trả phòng</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setAssignModalRoom(room);
                              setAssignInput('');
                              setAssignError(null);
                            }}
                            className="min-h-[36px] px-2 text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg flex items-center gap-1 font-semibold transition-colors"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Gán người</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenDeleteRoomModal(room)}
                          title="Xóa phòng này khỏi khu trọ"
                          className="min-h-[36px] px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg flex items-center gap-1 font-medium transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Xóa phòng</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: Cấu hình biểu giá khu trọ (Property Tariff Config) */}
      {showTariffConfigModal && selectedProperty && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-4 sm:p-8 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <h3 className="text-xl font-bold text-slate-900 mb-1">
              Cấu hình biểu giá: {selectedProperty.name}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Lựa chọn áp dụng biểu giá chuẩn Nhà nước hoặc thỏa thuận riêng cho khu trọ này.
            </p>

            <form onSubmit={handleSavePropertyTariff} className="space-y-4">
              {/* Choice radio buttons */}
              <div className="space-y-2">
                <label
                  onClick={() => setTariffConfigForm({ ...tariffConfigForm, tariff_type: 'statutory' })}
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    tariffConfigForm.tariff_type === 'statutory'
                      ? 'border-primary-600 bg-primary-50/60 ring-2 ring-primary-500/20'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="tariff_type"
                    checked={tariffConfigForm.tariff_type === 'statutory'}
                    onChange={() => {}}
                    className="mt-1 text-primary-600"
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-900 block">
                      Biểu giá chuẩn Nhà nước (Mặc định - Khuyên dùng)
                    </span>
                    <span className="text-xs text-slate-500">
                      Điện 6 bậc lũy tiến theo biểu giá Nhà nước{tariffConfig?.tariff_version ? ` (${tariffConfig.tariff_version})` : ''}. Hoàn toàn chuẩn luật.
                    </span>
                  </div>
                </label>

                <label
                  onClick={() => setTariffConfigForm({ ...tariffConfigForm, tariff_type: 'custom' })}
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    tariffConfigForm.tariff_type === 'custom'
                      ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="tariff_type"
                    checked={tariffConfigForm.tariff_type === 'custom'}
                    onChange={() => {}}
                    className="mt-1 text-blue-600"
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-900 block">
                      Đơn giá thỏa thuận tùy chọn
                    </span>
                    <span className="text-xs text-slate-500">
                      Chủ trọ tự quy định đơn giá phẳng cho điện và nước sinh hoạt.
                    </span>
                  </div>
                </label>
              </div>

              {/* Custom inputs when 'custom' is selected */}
              {tariffConfigForm.tariff_type === 'custom' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Đơn giá điện thỏa thuận (đ/kWh) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="50"
                      value={tariffConfigForm.custom_elec_rate}
                      onChange={(e) =>
                        setTariffConfigForm({ ...tariffConfigForm, custom_elec_rate: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Ví dụ: 3500"
                    />
                  </div>

                  {/* LIVE COMPLIANCE ALERT */}
                  {Number(tariffConfigForm.custom_elec_rate) > maxTierPrice && (
                    <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-900 space-y-1 animate-fadeIn">
                      <div className="flex items-center gap-1.5 font-bold text-red-700">
                        <ShieldAlert className="w-4 h-4 text-red-600" />
                        <span>CẢNH BÁO VI PHẠM ĐỊNH MỨC ({complianceDecree})</span>
                      </div>
                      <p className="leading-relaxed">
                        Đơn giá bạn nhập (<strong>{Number(tariffConfigForm.custom_elec_rate).toLocaleString('vi-VN')} đ/kWh</strong>) cao hơn mức giá trần quy định hiện hành ({maxTierPrice.toLocaleString('vi-VN')} đ/kWh chưa VAT).
                      </p>
                      <p className="text-[11px] text-red-700">
                        Chênh lệch dự kiến: <strong>+{(Number(tariffConfigForm.custom_elec_rate) - maxTierPrice).toLocaleString('vi-VN')} đ/kWh</strong>. Hành vi thu tiền điện cao hơn quy định có thể bị phạt tiền {penaltyText}!
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Đơn giá nước sinh hoạt (đ/m³) *
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="500"
                      value={tariffConfigForm.custom_water_rate}
                      onChange={(e) =>
                        setTariffConfigForm({ ...tariffConfigForm, custom_water_rate: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Ví dụ: 20000"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTariffConfigModal(false)}
                  className="min-h-[44px] px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-xl inline-flex items-center justify-center"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-xl shadow-sm inline-flex items-center justify-center"
                >
                  Lưu cấu hình
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Thêm Khu trọ */}
      {showAddPropModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4 sm:p-8 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <h3 className="text-xl font-bold text-slate-900 mb-4">Thêm Khu trọ mới</h3>
            <form onSubmit={handleCreateProperty} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase">
                  Tên Khu trọ / Tòa nhà *
                </label>
                <input
                  type="text"
                  required
                  value={propForm.name}
                  onChange={(e) => setPropForm({ ...propForm, name: e.target.value })}
                  placeholder="Ví dụ: Nhà trọ Minh Khai"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase">
                  Địa chỉ
                </label>
                <input
                  type="text"
                  value={propForm.address}
                  onChange={(e) => setPropForm({ ...propForm, address: e.target.value })}
                  placeholder="Số 123 đường ABC, Quận XYZ, TP. Hà Nội"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddPropModal(false)}
                  className="min-h-[44px] px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-xl inline-flex items-center justify-center"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-xl inline-flex items-center justify-center"
                >
                  Tạo khu trọ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Thêm Phòng */}
      {showAddRoomModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4 sm:p-8 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <h3 className="text-xl font-bold text-slate-900 mb-1">
              Thêm phòng cho {selectedProperty?.name}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Mã mời phòng sẽ tự động được sinh ngẫu nhiên để cung cấp cho người thuê.
            </p>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase">
                  Số phòng / Tên phòng *
                </label>
                <input
                  type="text"
                  required
                  value={roomForm.room_number}
                  onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })}
                  placeholder="Ví dụ: 101, P202, ..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase">
                  Số người đăng ký định mức điện
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  required
                  value={roomForm.current_people_count}
                  onChange={(e) => setRoomForm({ ...roomForm, current_people_count: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Cứ 4 người tạm trú = 1 định mức hộ gia đình theo Thông tư 60/2025/TT-BCT.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddRoomModal(false)}
                  className="min-h-[44px] px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-xl inline-flex items-center justify-center"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-xl inline-flex items-center justify-center"
                >
                  Tạo phòng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Tính Hóa Đơn (Draft vs Publish Flow) */}
      {calcModalRoom && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl p-4 sm:p-8 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <div className="flex items-start sm:items-center justify-between pb-4 border-b border-slate-100 mb-6 gap-2">
              <div>
                <div className="text-xs font-bold text-primary-600 uppercase tracking-wider">
                  Tính cước & Sinh hóa đơn minh bạch
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">
                  Phòng {calcModalRoom.room_number} — {selectedProperty?.name}
                </h3>
              </div>
              <button
                onClick={() => {
                  setCalcModalRoom(null);
                  setCalcResult(null);
                }}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 font-bold text-lg rounded-xl hover:bg-slate-100 transition-colors"
                title="Đóng modal"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            {selectedProperty?.tariff_type === 'custom' && (
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-2xl text-xs text-blue-900 flex items-center justify-between gap-2 mb-5">
                <span className="font-semibold">
                  ⚙️ Biểu giá khu trọ: <strong>{Number(selectedProperty.custom_elec_rate).toLocaleString('vi-VN')} đ/kWh</strong> • Nước: <strong>{Number(selectedProperty.custom_water_rate).toLocaleString('vi-VN')} đ/{selectedProperty.custom_water_type === 'PER_PERSON' ? 'người' : 'm³'}</strong>
                </span>
                <span className="text-[10px] text-blue-700 font-medium hidden sm:inline">Tự động áp dụng & đối chiếu</span>
              </div>
            )}

            <form onSubmit={handleCalculateInvoice} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase">
                    Tháng thanh toán (YYYY-MM) *
                  </label>
                  <input
                    type="month"
                    required
                    value={calcForm.month_year}
                    onChange={(e) => setCalcForm({ ...calcForm, month_year: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px]"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Định dạng YYYY-MM (Ví dụ: 2026-09)</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase">
                    Phương pháp tính điện
                  </label>
                  <select
                    value={calcForm.elec_method}
                    onChange={(e) => setCalcForm({ ...calcForm, elec_method: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px]"
                  >
                    <option value="TIERED">Bậc thang 6 bậc (Luật định)</option>
                    <option value="TIER3">Đồng giá bậc {fallbackTierNumber} ({fallbackTierPrice.toLocaleString('vi-VN')} đ/kWh)</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">Khuyên dùng bậc thang 6 bậc chuẩn</p>
                </div>
              </div>

              {/* Chỉ số điện */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                  ⚡ Chỉ số Điện (kWh)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Chỉ số đầu</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={calcForm.elec_start}
                      onChange={(e) => setCalcForm({ ...calcForm, elec_start: e.target.value })}
                      placeholder="0"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Chỉ số cuối</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={calcForm.elec_end}
                      onChange={(e) => setCalcForm({ ...calcForm, elec_end: e.target.value })}
                      placeholder="150"
                      className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-sm min-h-[44px] focus:outline-none focus:ring-2 ${
                        isElecInvalid
                          ? 'border-red-500 bg-red-50/40 text-red-900 focus:ring-red-400'
                          : 'border-slate-200 focus:ring-primary-500'
                      }`}
                    />
                  </div>
                </div>
                {isElecInvalid && (
                  <p className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1">
                    <span>⚠️ Chỉ số điện cuối không được nhỏ hơn chỉ số đầu.</span>
                  </p>
                )}
              </div>

              {/* Chỉ số nước */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                  💧 Chỉ số Nước (m³)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Chỉ số đầu</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={calcForm.water_start}
                      onChange={(e) => setCalcForm({ ...calcForm, water_start: e.target.value })}
                      placeholder="0"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Chỉ số cuối</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={calcForm.water_end}
                      onChange={(e) => setCalcForm({ ...calcForm, water_end: e.target.value })}
                      placeholder="5"
                      className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-sm min-h-[44px] focus:outline-none focus:ring-2 ${
                        isWaterInvalid
                          ? 'border-red-500 bg-red-50/40 text-red-900 focus:ring-red-400'
                          : 'border-slate-200 focus:ring-primary-500'
                      }`}
                    />
                  </div>
                </div>
                {isWaterInvalid && (
                  <p className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1">
                    <span>⚠️ Chỉ số nước cuối không được nhỏ hơn chỉ số đầu.</span>
                  </p>
                )}
              </div>

              {/* Tiền thực thu để đối chiếu thu lố */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 uppercase">
                  Số tiền chủ trọ dự định thu / đã thu (VNĐ)
                </label>
                <input
                  type="number"
                  value={calcForm.actual_collected_amount}
                  onChange={(e) => setCalcForm({ ...calcForm, actual_collected_amount: e.target.value })}
                  placeholder="Để trống nếu thu đúng theo luật định"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px]"
                />
              </div>

              {/* LIVE COMPLIANCE ALERT IN FORM */}
              {liveFormCompliance && (
                <div className="p-3.5 bg-red-50 border-2 border-red-400 rounded-2xl text-xs text-red-900 space-y-1 animate-pulse">
                  <div className="flex items-center gap-2 font-black text-red-700">
                    <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span>CẢNH BÁO VI PHẠM ĐỊNH MỨC ({complianceDecree})</span>
                  </div>
                  <p className="leading-relaxed">
                    Số tiền bạn nhập thu (<strong>{liveFormCompliance.actualEst.toLocaleString('vi-VN')} đ</strong>) cao hơn mức luật định dự kiến (~{liveFormCompliance.approxStatutoryTotal.toLocaleString('vi-VN')} đ). Chênh lệch thu lố dự kiến: <strong>+{liveFormCompliance.diff.toLocaleString('vi-VN')} đ</strong>!
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={calculating || isElecInvalid || isWaterInvalid}
                className="w-full min-h-[44px] py-3 bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {calculating ? (
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <Calculator className="w-4 h-4" />
                    <span>{calcResult ? 'Tính lại / Cập nhật' : 'Tạo bản nháp hóa đơn (Draft)'}</span>
                  </>
                )}
              </button>
            </form>

            {/* BREAKDOWN RESULTS & DRAFT / PUBLISH ACTIONS */}
            {calcResult && (
              <div className="mt-6 pt-6 border-t border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary-600" />
                    <span>Kết quả tính toán</span>
                  </h4>

                  {/* Status Badge */}
                  {calcResult.status === 'published' ? (
                    <span className="self-start sm:self-auto px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full border border-emerald-300">
                      Đã phát hành (Published)
                    </span>
                  ) : (
                    <span className="self-start sm:self-auto px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-300">
                      Bản nháp (Draft) — Chưa gửi khách
                    </span>
                  )}
                </div>

                {/* Overcharge Alert */}
                {calcResult.diff_amount > 0 ? (
                  <div className="p-4 bg-red-50 border-2 border-red-500 rounded-2xl text-red-900 space-y-1.5 shadow-sm">
                    <div className="flex items-center gap-2 font-black text-red-600 text-sm">
                      <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                      <span>CẢNH BÁO: CHÊNH LỆCH THU LỐ {Number(calcResult.diff_amount).toLocaleString('vi-VN')} VNĐ!</span>
                    </div>
                    <p className="text-xs text-red-800 leading-relaxed">
                      Tiền thực thu ({Number(calcResult.actual_collected_amount).toLocaleString('vi-VN')} đ) cao hơn quy định pháp luật ({Number(calcResult.total_statutory_amount).toLocaleString('vi-VN')} đ). Vi phạm quy định tại {complianceDecree} và có nguy cơ bị xử phạt hành chính từ {penaltyText}.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 flex items-center gap-2 text-xs font-semibold">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <span>Hóa đơn hợp lệ & hoàn toàn minh bạch theo quy định nhà nước.</span>
                  </div>
                )}

                {/* Summary amounts */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-[11px] text-slate-500 font-semibold">Tiền điện (VAT 8%)</p>
                    <p className="text-base font-black text-slate-900 mt-1">
                      {Number(calcResult.elec_amount).toLocaleString('vi-VN')} đ
                    </p>
                    <p className="text-[10px] text-slate-400">{calcResult.elec_kwh} kWh</p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <p className="text-[11px] text-slate-500 font-semibold">Tiền nước</p>
                    <p className="text-base font-black text-slate-900 mt-1">
                      {Number(calcResult.water_amount).toLocaleString('vi-VN')} đ
                    </p>
                    <p className="text-[10px] text-slate-400">{calcResult.water_usage} m³</p>
                  </div>

                  <div className="p-3 bg-primary-50 rounded-xl border border-primary-200">
                    <p className="text-[11px] text-primary-700 font-bold">Tổng luật định</p>
                    <p className="text-base font-black text-primary-800 mt-1">
                      {Number(calcResult.total_statutory_amount).toLocaleString('vi-VN')} đ
                    </p>
                  </div>
                </div>

                {/* Short Code & Publish Actions */}
                <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-400">Mã tra cứu ngắn:</span>
                        <span className="px-2 py-0.5 bg-white/20 rounded font-mono font-bold text-xs text-white">
                          {calcResult.short_code || 'HD-DRAFT'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Người thuê có thể nhập trực tiếp mã này vào Cổng tra cứu công khai
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {calcResult.short_code && (
                        <button
                          type="button"
                          onClick={() => handleCopy(calcResult.short_code, 'short-code')}
                          className="min-h-[44px] px-3.5 py-2 bg-white/10 hover:bg-white/20 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5 text-slate-300" />
                          <span>{copiedToken === 'short-code' ? 'Đã sao chép!' : 'Chép mã'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onViewPublicInvoice?.(calcResult.share_token)}
                        className="min-h-[44px] px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Xem hóa đơn</span>
                      </button>
                    </div>
                  </div>

                  {/* Publish Button */}
                  {calcResult.status !== 'published' ? (
                    <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <span className="text-xs text-amber-300 leading-relaxed">
                        Hóa đơn hiện ở trạng thái <strong>Bản nháp</strong> và chưa hiển thị cho người thuê.
                      </span>
                      <button
                        type="button"
                        disabled={publishing}
                        onClick={() => handlePublishInvoice(calcResult.id)}
                        className="min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md flex-shrink-0"
                      >
                        {publishing ? (
                          <span className="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Phát hành & Gửi cho người thuê</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-slate-800 flex items-center gap-2 text-xs text-emerald-400">
                      <Check className="w-4 h-4" />
                      <span>Hóa đơn đã được phát hành và gửi đến Dashboard của người thuê trọ.</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Lịch sử hóa đơn phòng */}
      {historyModalRoom && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl p-4 sm:p-8 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  Lịch sử hóa đơn — Phòng {historyModalRoom.room_number}
                </h3>
                <p className="text-xs text-slate-500">Danh sách các kỳ hóa đơn đã lập</p>
              </div>
              <button
                onClick={() => setHistoryModalRoom(null)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 font-bold text-lg rounded-xl hover:bg-slate-100 transition-colors"
                title="Đóng"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            {loadingHistory ? (
              <div className="p-8 text-center text-slate-400 text-sm">Đang tải lịch sử...</div>
            ) : roomInvoicesList.length === 0 ? (
              <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center bg-slate-50/40">
                <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">Chưa có hóa đơn nào cho phòng này</p>
                <p className="text-xs text-slate-400 mt-1 mb-4">
                  Bấm "Tính hóa đơn" trên thẻ phòng để lập bản kê nháp cho kỳ này.
                </p>
                <button
                  onClick={() => {
                    const r = historyModalRoom;
                    setHistoryModalRoom(null);
                    handleOpenCalcModal(r);
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                >
                  <Calculator className="w-4 h-4" />
                  <span>Lập hóa đơn ngay</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
                {roomInvoicesList.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">Tháng {inv.month_year}</span>
                        {inv.status === 'published' ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Đã phát hành
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                            Bản nháp
                          </span>
                        )}
                        {inv.short_code && (
                          <span className="px-2 py-0.5 font-mono text-[10px] font-bold bg-white text-slate-700 border border-slate-300 rounded">
                            {inv.short_code}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        Tổng tiền: <strong>{Number(inv.total_statutory_amount).toLocaleString('vi-VN')} đ</strong> (Điện: {inv.elec_kwh} kWh, Nước: {inv.water_usage} m³)
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {inv.status !== 'published' && (
                        <button
                          onClick={() => handlePublishInvoice(inv.id)}
                          className="min-h-[44px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Phát hành</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setHistoryModalRoom(null);
                          onViewPublicInvoice?.(inv.share_token);
                        }}
                        className="min-h-[44px] px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Xem</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Gán người thuê */}
      {assignModalRoom && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4 sm:p-8 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Gán khách thuê vào Phòng {assignModalRoom.room_number}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Nhập username hoặc số điện thoại của người thuê để gán trực tiếp vào phòng.
            </p>
            {assignError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {assignError}
              </div>
            )}
            <form onSubmit={handleAssignTenant} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase">
                  Username hoặc Số điện thoại người thuê
                </label>
                <input
                  type="text"
                  required
                  value={assignInput}
                  onChange={(e) => setAssignInput(e.target.value)}
                  placeholder="Ví dụ: nguyenvana hoặc 0912345678"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAssignModalRoom(null)}
                  className="min-h-[44px] px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-xl inline-flex items-center justify-center"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={assignLoading}
                  className="min-h-[44px] px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-xl disabled:opacity-60 shadow-sm flex items-center justify-center"
                >
                  {assignLoading ? 'Đang gán...' : 'Gán người thuê'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Xóa khu trọ */}
      {showDeletePropModal && selectedProperty && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4 sm:p-8 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Xác nhận xóa khu trọ</h3>
                <p className="text-xs text-slate-500 font-mono">{selectedProperty.name}</p>
              </div>
            </div>

            <div className="p-3.5 bg-red-50/80 border border-red-200 rounded-2xl mb-4 text-xs text-red-700 leading-relaxed">
              <p className="font-semibold mb-1">Cảnh báo bảo mật & an toàn dữ liệu:</p>
              Hành động này sẽ xóa vĩnh viễn khu trọ cùng các phòng trống và hóa đơn liên quan. Khu trọ chỉ được phép xóa khi <strong>tất cả các phòng đều không có khách thuê</strong>.
            </div>

            {deletePropError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {deletePropError}
              </div>
            )}

            <form onSubmit={handleConfirmDeleteProp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase">
                  Nhập mật khẩu chủ trọ để xác thực
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    value={deletePropPassword}
                    onChange={(e) => setDeletePropPassword(e.target.value)}
                    placeholder="Mật khẩu tài khoản của bạn"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deletePropLoading}
                  onClick={() => setShowDeletePropModal(false)}
                  className="min-h-[44px] px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-xl inline-flex items-center justify-center"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={deletePropLoading}
                  className="min-h-[44px] px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl disabled:opacity-60 shadow-sm flex items-center justify-center gap-1.5"
                >
                  {deletePropLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang xóa...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Xác nhận xóa vĩnh viễn</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Xóa phòng */}
      {deleteRoomModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4 sm:p-8 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Xóa Phòng {deleteRoomModal.room_number}</h3>
                <p className="text-xs text-slate-500">Khu trọ: {selectedProperty?.name}</p>
              </div>
            </div>

            <div className="p-3.5 bg-red-50/80 border border-red-200 rounded-2xl mb-4 text-xs text-red-700 leading-relaxed">
              <p className="font-semibold mb-1">Cảnh báo:</p>
              Hành động này sẽ xóa vĩnh viễn Phòng {deleteRoomModal.room_number} cùng lịch sử hóa đơn. Chỉ thực hiện được khi phòng <strong>ở trạng thái TRỐNG</strong>.
            </div>

            {deleteRoomError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {deleteRoomError}
              </div>
            )}

            <form onSubmit={handleConfirmDeleteRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase">
                  Nhập mật khẩu chủ trọ để xác thực
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    value={deleteRoomPassword}
                    onChange={(e) => setDeleteRoomPassword(e.target.value)}
                    placeholder="Mật khẩu tài khoản của bạn"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deleteRoomLoading}
                  onClick={() => setDeleteRoomModal(null)}
                  className="min-h-[44px] px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-xl inline-flex items-center justify-center"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={deleteRoomLoading}
                  className="min-h-[44px] px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl disabled:opacity-60 shadow-sm flex items-center justify-center gap-1.5"
                >
                  {deleteRoomLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang xóa...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Xóa phòng</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Chủ trọ đề xuất đổi số người định mức (Dual-Approval) */}
      {occupancyModalRoom && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4 sm:p-8 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <div className="flex items-center gap-3 text-primary-600 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-primary-100 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Đổi số người: Phòng {occupancyModalRoom.room_number}
                </h3>
                <p className="text-xs text-slate-500">Cơ chế xác thực kép an toàn (Dual-Approval)</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Bạn đang gửi đề xuất thay đổi số người tính định mức. Khách thuê cần đăng nhập để phê duyệt trước khi số người mới chính thức áp dụng.
            </p>

            {occupancyError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {occupancyError}
              </div>
            )}

            <form onSubmit={handleSubmitOccupancyProposal} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Số người mới *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    required
                    value={occupancyForm.new_people_count}
                    onChange={(e) =>
                      setOccupancyForm((prev) => ({ ...prev, new_people_count: e.target.value }))
                    }
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ngày áp dụng *
                  </label>
                  <input
                    type="date"
                    required
                    value={occupancyForm.effective_date}
                    onChange={(e) =>
                      setOccupancyForm((prev) => ({ ...prev, effective_date: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lý do / Ghi chú cho khách thuê (tùy chọn)
                </label>
                <input
                  type="text"
                  value={occupancyForm.note}
                  onChange={(e) => setOccupancyForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="Ví dụ: Có người chuyển thêm vào phòng từ giữa tháng"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase">
                  Mật khẩu chủ trọ để ký đề xuất *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    value={occupancyForm.password}
                    onChange={(e) =>
                      setOccupancyForm((prev) => ({ ...prev, password: e.target.value }))
                    }
                    placeholder="Nhập mật khẩu tài khoản của bạn"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={occupancySubmitting}
                  onClick={() => setOccupancyModalRoom(null)}
                  className="min-h-[44px] px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-xl inline-flex items-center justify-center"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={occupancySubmitting}
                  className="min-h-[44px] px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-xl disabled:opacity-60 shadow-sm flex items-center justify-center gap-1.5"
                >
                  {occupancySubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang gửi...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Gửi đề xuất cho khách</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Từ chối đề xuất đổi số người */}
      {rejectModalReq && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-4 sm:p-8 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3 sm:hidden" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              Từ chối yêu cầu đổi số người
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Nhập lý do từ chối để đối tác nắm rõ nguyên nhân:
            </p>

            <div className="space-y-4">
              <textarea
                rows="3"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ví dụ: Chưa cung cấp thông tin người tạm trú mới..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={rejecting}
                  onClick={() => {
                    setRejectModalReq(null);
                    setRejectReason('');
                  }}
                  className="min-h-[44px] px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-xl inline-flex items-center justify-center"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={rejecting}
                  onClick={handleLandlordReject}
                  className="min-h-[44px] px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl disabled:opacity-60 shadow-sm flex items-center justify-center"
                >
                  {rejecting ? 'Đang gửi...' : 'Xác nhận từ chối'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
