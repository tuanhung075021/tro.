/*
 * Copyright (c) 2026 tro. Contributors
 * SPDX-License-Identifier: MIT
 */

import React, { useState, useEffect, useCallback } from 'react';
import { invoices as invoiceApi } from '../services/api';
import { useTariff } from '../context/TariffContext';
import {
  FileText,
  Search,
  Zap,
  Droplets,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Building2,
  Copy,
  Check,
  Printer,
  Home,
  CheckCircle2,
  Bookmark,
  Loader2,
  Users,
} from 'lucide-react';

export default function PublicInvoiceView({ initialToken = '', onBackToHome }) {
  const {
    tariffConfig,
    fallbackTierNumber,
    legalBasisElec,
    complianceDecree,
    penaltyText,
  } = useTariff();
  const [shareToken, setShareToken] = useState(initialToken);
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const fetchInvoice = useCallback(async (token) => {
    let cleaned = token?.trim();
    if (!cleaned) return;
    if (cleaned.includes('/public/')) {
      cleaned = cleaned.split('/public/').pop().split('?')[0].split('#')[0].trim();
    } else if (cleaned.includes('/')) {
      cleaned = cleaned.split('/').pop().split('?')[0].split('#')[0].trim();
    }
    cleaned = cleaned.replace(/^#/, '').trim();
    if (!cleaned) return;

    setLoading(true);
    setError(null);
    try {
      const data = await invoiceApi.getPublic(cleaned);
      setInvoice(data);
      setShareToken(cleaned);
    } catch (err) {
      setError(err.message || `Không tìm thấy hóa đơn với mã "${cleaned}"`);
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialToken) {
      fetchInvoice(initialToken);
      setTokenInput(initialToken);
    }
  }, [initialToken, fetchInvoice]);

  const handleSearch = (e) => {
    e.preventDefault();
    let token = tokenInput.trim();
    if (token) {
      if (token.includes('/public/')) {
        token = token.split('/public/').pop().split('?')[0].split('#')[0].trim();
      } else if (token.includes('/')) {
        token = token.split('/').pop().split('?')[0].split('#')[0].trim();
      }
      token = token.replace(/^#/, '').trim();
      fetchInvoice(token);
      window.history.pushState(null, '', `/public/${encodeURIComponent(token)}`);
    }
  };

  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}/public/${encodeURIComponent(invoice?.share_token || shareToken)}`;
    navigator.clipboard?.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = (code) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const breakdown =
    invoice?.breakdown ||
    (invoice?.breakdown_json
      ? (typeof invoice.breakdown_json === 'string'
          ? (() => {
              try {
                return JSON.parse(invoice.breakdown_json);
              } catch {
                return {};
              }
            })()
          : invoice.breakdown_json)
      : {});
  const elecBreakdown = breakdown.electricity || {};
  const waterBreakdown = breakdown.water || {};
  const meterReading = breakdown.meter_reading || {};
  const dispute = breakdown.dispute || {};
  const isOvercharged = (invoice?.diff_amount || 0) > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-8 px-2 sm:px-4 py-2 sm:py-6">
      {/* Top Search Bar */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-8 border border-slate-200/80 shadow-sm no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary-600">
              Cổng Tra Cứu Hóa Đơn Công Khai
            </span>
            <p className="text-xs text-slate-500 mt-0.5">
              Nhập mã chia sẻ token hoặc Mã hóa đơn ngắn (ví dụ: HD-89B2)
            </p>
          </div>

          {onBackToHome && (
            <button
              onClick={onBackToHome}
              className="min-h-[44px] px-4 py-2.5 inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors self-start sm:self-auto"
            >
              ← Về trang chủ
            </button>
          )}
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2.5 sm:gap-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              required
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Nhập mã tra cứu ngắn (ví dụ: HD-89B2) hoặc link share token..."
              className="min-h-[44px] h-12 w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-base sm:text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="min-h-[44px] h-12 w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 active:scale-[0.98] text-white font-bold text-sm rounded-2xl shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang tìm...</span>
              </>
            ) : (
              'Tra cứu'
            )}
          </button>
        </form>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-3xl text-sm text-red-800 flex items-start gap-3 shadow-sm no-print">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Không tìm thấy thông tin hóa đơn</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="p-12 text-center text-slate-400 text-sm no-print flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          <p>Đang tải dữ liệu hóa đơn công khai...</p>
        </div>
      )}

      {/* Empty / Initial Welcome State */}
      {!invoice && !loading && !error && (
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 p-6 sm:p-12 text-center shadow-sm space-y-5 no-print">
          <div className="w-16 h-16 rounded-3xl bg-primary-50 border border-primary-100 flex items-center justify-center text-primary-600 mx-auto shadow-inner">
            <Search className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg sm:text-xl font-black text-slate-900">
              Tra cứu hóa đơn điện nước minh bạch
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Nhập <strong>Mã hóa đơn ngắn</strong> (ví dụ: <span className="font-mono font-bold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">HD-89B2</span>) hoặc dán toàn bộ đường dẫn chia sẻ do chủ trọ cung cấp vào ô phía trên để kiểm tra đối chiếu chi phí.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto pt-4 border-t border-slate-100 text-left">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="text-xs font-bold text-slate-800">Chuẩn luật định</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{legalBasisElec}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="text-xs font-bold text-slate-800">Cảnh báo thu lố</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Phát hiện chênh lệch {complianceDecree}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <p className="text-xs font-bold text-slate-800">In ấn A4 FOSS</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Xuất file PDF & in hóa đơn chuẩn mực</p>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Card */}
      {invoice && !loading && (
        <div className="printable-invoice bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden print:shadow-none print:border-none">
          {/* Invoice Header */}
          <div className="p-3.5 sm:p-8 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:bg-slate-100 print:text-slate-900 print:border-b print:border-slate-300">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xl font-black tracking-tight text-white print:text-slate-900">
                  tro<span className="text-primary-500">.</span>
                </span>
                {invoice.status === 'published' ? (
                  <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 print:text-emerald-800 print:bg-emerald-100">
                    Đã phát hành
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 print:text-amber-800 print:bg-amber-100">
                    Bản nháp (Draft)
                  </span>
                )}
                {invoice.short_code && (
                  <span className="px-2.5 py-0.5 text-[11px] font-mono font-bold rounded-full bg-white/10 text-white border border-white/20 print:text-slate-800 print:bg-slate-200">
                    Mã: {invoice.short_code}
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-black mt-2 print:text-xl">
                Hóa đơn Điện Nước — Tháng {invoice.month_year}
              </h2>
              <p className="text-xs text-slate-400 print:text-slate-600 mt-1">
                {(breakdown.property_name || invoice.property_name) ? `${breakdown.property_name || invoice.property_name} • ` : ''}
                Phòng {breakdown.room_number || invoice.room_number || invoice.room_id}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 no-print w-full sm:w-auto">
              {invoice.short_code && (
                <button
                  onClick={() => handleCopyCode(invoice.short_code)}
                  className="min-h-[44px] px-3.5 py-2.5 bg-white/10 hover:bg-white/20 active:scale-[0.98] text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  title="Sao chép mã tra cứu"
                >
                  <Bookmark className="w-3.5 h-3.5 text-primary-400" />
                  <span>{copiedCode ? 'Đã chép mã!' : invoice.short_code}</span>
                </button>
              )}

              <button
                onClick={handleCopyLink}
                className="min-h-[44px] px-3.5 py-2.5 bg-white/10 hover:bg-white/20 active:scale-[0.98] text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Đã sao chép' : 'Sao chép link'}</span>
              </button>

              <button
                onClick={() => window.print()}
                className="col-span-2 sm:col-span-1 min-h-[44px] px-4 py-2.5 bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>In hóa đơn / Lưu PDF</span>
              </button>
            </div>
          </div>

          {/* DISPUTE OVERCHARGE BANNER */}
          <div className="p-3.5 sm:p-6 border-b border-slate-200">
            {isOvercharged ? (
              <div className="p-4 sm:p-5 bg-red-50 border-2 border-red-500 rounded-2xl text-red-900 space-y-2">
                <div className="flex items-center gap-2 text-base font-black text-red-600">
                  <ShieldAlert className="w-6 h-6" />
                  <span>PHÁT HIỆN THU LỐ: {Number(invoice.diff_amount).toLocaleString('vi-VN')} VNĐ!</span>
                </div>
                <p className="text-xs sm:text-sm text-red-800 leading-relaxed">
                  Căn cứ {breakdown.compliance_decree || complianceDecree}, hành vi thu tiền điện của người thuê trọ cao hơn giá quy định của nhà nước có thể bị phạt tiền từ <strong>{breakdown.penalty_text || penaltyText}</strong>.
                </p>
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 text-xs font-semibold">
                  <div className="p-2.5 bg-white/70 rounded-xl">
                    Tiền luật định: <strong className="text-slate-900 block sm:inline">{Number(invoice.total_statutory_amount).toLocaleString('vi-VN')} đ</strong>
                  </div>
                  <div className="p-2.5 bg-white/70 rounded-xl">
                    Tiền thực thu: <strong className="text-slate-900 block sm:inline">{Number(invoice.actual_collected_amount).toLocaleString('vi-VN')} đ</strong>
                  </div>
                  <div className="p-2.5 bg-white/70 rounded-xl">
                    Chênh lệch thu lố: <strong className="text-red-600 block sm:inline">+{Number(invoice.diff_amount).toLocaleString('vi-VN')} đ</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div className="text-xs sm:text-sm">
                  <p className="font-bold">Hóa đơn hợp lệ theo quy định nhà nước</p>
                  <p className="text-emerald-700 mt-0.5">
                    Khoản thu tiền điện nước tuân thủ đúng khung biểu giá bậc thang sinh hoạt, không phát hiện thu lố hay vi phạm định mức.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="p-3.5 sm:p-8 space-y-5 sm:space-y-8">
            {/* METER READINGS SECTION */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-1.5">
                <span>Chỉ số công tơ điện nước</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Điện */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center justify-between font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5 text-amber-700 font-bold">
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      Công tơ điện
                    </span>
                    <span className="font-mono font-black text-slate-900">{invoice.elec_kwh} kWh</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 text-xs pt-1.5 border-t border-slate-100">
                    <span>Chỉ số đầu: <strong className="font-mono text-slate-800">{meterReading.elec_start ?? '—'}</strong></span>
                    <span>Chỉ số cuối: <strong className="font-mono text-slate-800">{meterReading.elec_end ?? '—'}</strong></span>
                  </div>
                </div>

                {/* Nước */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center justify-between font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5 text-blue-700 font-bold">
                      <Droplets className="w-3.5 h-3.5 fill-current" />
                      Công tơ nước
                    </span>
                    <span className="font-mono font-black text-slate-900">{invoice.water_usage} m³</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 text-xs pt-1.5 border-t border-slate-100">
                    <span>Chỉ số đầu: <strong className="font-mono text-slate-800">{meterReading.water_start ?? '—'}</strong></span>
                    <span>Cuối kỳ: <strong className="font-mono text-slate-800">{meterReading.water_end ?? '—'}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* ELECTRICITY SECTION */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                    <Zap className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Chi tiết Tiền Điện</h3>
                    <p className="text-xs text-slate-500">
                      Định mức: <strong>{elecBreakdown.quota || 1} hộ</strong> • Phương pháp:{' '}
                      <strong>
                        {elecBreakdown.method === 'TIER3'
                          ? `Đồng giá Bậc ${elecBreakdown.fallback_tier_number || fallbackTierNumber}`
                          : `Bậc thang 6 bậc (${breakdown.tariff_version || tariffConfig?.tariff_version || 'Luật định'})`}
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-500 block">Sản lượng tiêu thụ</span>
                  <span className="text-lg font-black text-slate-900">{invoice.elec_kwh} kWh</span>
                </div>
              </div>

              {/* Prorated Mid-Month Occupancy Allocation */}
              {elecBreakdown.occupancy_prorated?.is_prorated && (
                <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>Phân bổ định mức theo ngày thực tế (Thông tư 60/2025/TT-BCT)</span>
                  </div>
                  <p className="text-blue-700 text-[11px] leading-relaxed">
                    Trong tháng có thay đổi số người ở ({elecBreakdown.occupancy_prorated.days_in_month} ngày). Tổng nhân-ngày: <strong>{elecBreakdown.occupancy_prorated.total_person_days}</strong> • Định mức bình quân quy đổi: <strong>{elecBreakdown.occupancy_prorated.effective_quota} hộ</strong>.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {elecBreakdown.occupancy_prorated.periods?.map((p, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded-lg border border-blue-200 font-mono text-[11px] text-blue-800 shadow-xs">
                        Ngày {p.from_day} - {p.to_day} ({p.days} ngày): <strong>{p.people_count} người</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Progressive Tiers Table */}
              {elecBreakdown.tiers && elecBreakdown.tiers.length > 0 && (
                <div>
                  <div className="text-[10px] text-slate-400 sm:hidden mb-1 flex items-center justify-between font-medium">
                    <span>Chi tiết từng bậc điện</span>
                    <span>← Vuốt ngang để xem đầy đủ →</span>
                  </div>
                  <div className="overflow-x-auto scrollbar-thin pb-2 rounded-xl border border-slate-100">
                  <table className="w-full min-w-[500px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[10px] tracking-wider bg-slate-50/50">
                        <th className="py-2.5 px-3 whitespace-nowrap">Bậc</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Khung kWh</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Sản lượng</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Đơn giá (đ/kWh)</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {elecBreakdown.tiers.map((tier) => (
                        <tr key={tier.tier_number} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">Bậc {tier.tier_number}</td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            {tier.threshold_applied ? `Tối đa ${tier.threshold_applied} kWh` : 'Còn lại'}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">{tier.kwh_used} kWh</td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            {Number(tier.unit_price).toLocaleString('vi-VN')} đ
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 text-right whitespace-nowrap">
                            {Number(tier.amount).toLocaleString('vi-VN')} đ
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

              {/* Electricity Summary Footer */}
              <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-amber-800">Thuế GTGT (8%): </span>
                  <strong className="text-slate-900">
                    {Number(elecBreakdown.vat_amount || 0).toLocaleString('vi-VN')} đ
                  </strong>
                </div>
                <div className="text-sm font-black text-amber-950">
                  <span>Tổng tiền điện: </span>
                  <span>{Number(invoice.elec_amount).toLocaleString('vi-VN')} đ</span>
                </div>
              </div>
            </div>

            {/* WATER SECTION */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-100 text-blue-800">
                    <Droplets className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Chi tiết Tiền Nước</h3>
                    <p className="text-xs text-slate-500">
                      Hình thức: <strong>{waterBreakdown.pricing_type === 'PER_PERSON' ? 'Theo đầu người' : 'Theo m³ tiêu thụ'}</strong>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-500 block">Khối lượng nước</span>
                  <span className="text-lg font-black text-slate-900">{invoice.water_usage} m³</span>
                </div>
              </div>

              {/* Water Summary Footer */}
              <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-200/80 grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-blue-800">Tiền nước: </span>
                  <strong className="text-slate-900 block sm:inline">
                    {Number(waterBreakdown.pre_tax_amount || 0).toLocaleString('vi-VN')} đ
                  </strong>
                </div>
                <div>
                  <span className="text-blue-800">VAT (5%): </span>
                  <strong className="text-slate-900 block sm:inline">
                    {Number(waterBreakdown.vat_amount || 0).toLocaleString('vi-VN')} đ
                  </strong>
                </div>
                <div>
                  <span className="text-blue-800">Phí BVMT (10%): </span>
                  <strong className="text-slate-900 block sm:inline">
                    {Number(waterBreakdown.env_fee_amount || 0).toLocaleString('vi-VN')} đ
                  </strong>
                </div>
                <div className="col-span-2 sm:col-span-1 pt-2 sm:pt-0 border-t sm:border-t-0 border-blue-200/60 text-sm font-black text-blue-950">
                  <span>Tổng tiền nước: </span>
                  <span>{Number(invoice.water_amount).toLocaleString('vi-VN')} đ</span>
                </div>
              </div>
            </div>

            {/* GRAND TOTAL ROW */}
            <div className="p-6 bg-slate-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                  Tổng chi phí theo luật định
                </p>
                <p className="text-3xl font-black text-primary-700 mt-1">
                  {Number(invoice.total_statutory_amount).toLocaleString('vi-VN')} đ
                </p>
              </div>

              {invoice.actual_collected_amount != null && (
                <div className="text-left sm:text-right">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                    Số tiền chủ trọ thực tế đã thu
                  </p>
                  <p className="text-2xl font-black text-slate-900 mt-1">
                    {Number(invoice.actual_collected_amount).toLocaleString('vi-VN')} đ
                  </p>
                </div>
              )}
            </div>

            {/* Financial Signature Block (Visible on print & on screen) */}
            <div className="pt-8 border-t border-slate-200 grid grid-cols-2 gap-8 text-center text-xs">
              <div className="space-y-16">
                <div>
                  <p className="font-bold text-slate-900 uppercase">Người lập hóa đơn</p>
                  <p className="text-[11px] text-slate-500 italic">(Ký và ghi rõ họ tên)</p>
                </div>
                <div className="w-full max-w-[140px] sm:max-w-[180px] mx-auto border-b border-dashed border-slate-300 h-0 my-2" />
              </div>

              <div className="space-y-16">
                <div>
                  <p className="font-bold text-slate-900 uppercase">Người thuê xác nhận</p>
                  <p className="text-[11px] text-slate-500 italic">(Ký và ghi rõ họ tên)</p>
                </div>
                <div className="w-full max-w-[140px] sm:max-w-[180px] mx-auto border-b border-dashed border-slate-300 h-0 my-2" />
              </div>
            </div>

            <div className="text-center text-[11px] text-slate-400 pt-4 border-t border-slate-100">
              tro. — Hệ thống Quản lý Lưu trú & Đối chiếu Chi phí Điện Nước Minh bạch • Giấy phép MIT
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
