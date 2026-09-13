/*
 * Copyright (c) 2026 tro. Contributors
 * SPDX-License-Identifier: MIT
 */

import React, { useEffect, useMemo } from 'react';
import { X, Scale, ShieldCheck, Zap, Droplets, BookOpen, AlertCircle } from 'lucide-react';
import { useTariff } from '../context/TariffContext';

// Default fallback tiers (QD-1279-2023) — shown only before /config loads
const DEFAULT_TIERS_FALLBACK = [
  { tier_number: 1, unit_price: 1984, range: '0 – 50 kWh' },
  { tier_number: 2, unit_price: 2050, range: '51 – 100 kWh' },
  { tier_number: 3, unit_price: 2380, range: '101 – 200 kWh' },
  { tier_number: 4, unit_price: 2998, range: '201 – 300 kWh' },
  { tier_number: 5, unit_price: 3350, range: '301 – 400 kWh' },
  { tier_number: 6, unit_price: 3460, range: 'Từ 401 kWh trở lên' },
];

/** Format a kWh threshold range label from sorted tier list */
function buildTierRange(tiers, idx) {
  const cumBefore = tiers
    .slice(0, idx)
    .reduce((s, t) => s + (t.max_threshold ?? 0), 0);
  const t = tiers[idx];
  if (t.max_threshold == null) {
    // Last tier — no upper bound
    return `Từ ${Math.round(cumBefore) + 1} kWh trở lên`;
  }
  const upper = cumBefore + (t.max_threshold ?? 0);
  return idx === 0
    ? `0 – ${Math.round(upper)} kWh`
    : `${Math.round(cumBefore) + 1} – ${Math.round(upper)} kWh`;
}

export default function TariffModal({ isOpen, onClose }) {
  const {
    tariffConfig,
    fallbackTierNumber,
    fallbackTierPrice,
    legalBasisElec,
    legalBasisVat,
    complianceDecree,
    tier3RuleNote,
  } = useTariff();

  // Keyboard close handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Build dynamic tiers from tariffConfig, fall back to static defaults
  const tiers = useMemo(() => {
    const rawTiers = tariffConfig?.tiers;
    if (!rawTiers || rawTiers.length === 0) return DEFAULT_TIERS_FALLBACK;
    return rawTiers.map((t, idx) => ({
      ...t,
      range: buildTierRange(rawTiers, idx),
    }));
  }, [tariffConfig]);

  const vatRate = tariffConfig?.electricity_vat_rate ?? 0.08;
  const waterUnitPrice = tariffConfig?.water_unit_price ?? 8500;
  const waterVatRate = tariffConfig?.water_vat_rate ?? 0.05;
  const waterEnvRate = tariffConfig?.water_env_fee_rate ?? 0.10;
  const activeVersion = tariffConfig?.tariff_version || 'QD-1279-2023';
  const updatedAt = tariffConfig?.tariff_updated_at || null;

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  };

  const fmtPrice = (price) =>
    Number(price).toLocaleString('vi-VN') + ' đ';

  const fmtPriceVat = (price, vat) =>
    Math.round(Number(price) * (1 + vat)).toLocaleString('vi-VN') + ' đ';

  if (!isOpen) return null;

  const vatPct = Math.round(vatRate * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl sm:rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900">Biểu giá quy định nhà nước</h2>
                <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-[11px] font-bold rounded-full border border-blue-200 font-mono">
                  Phiên bản: {activeVersion || 'QD-1279-2023'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Căn cứ pháp lý tính tiền điện và nước sinh hoạt</span>
                {formatDate(updatedAt) && (
                  <>
                    <span>•</span>
                    <span className="text-[11px] text-slate-400">
                      Cập nhật: {formatDate(updatedAt)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 rounded-xl transition-colors"
            title="Đóng (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 text-xs sm:text-sm overflow-y-auto scrollbar-thin">
          {/* Căn cứ pháp lý tóm lược */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                <BookOpen className="w-3.5 h-3.5 text-primary-600" />
                <span>{legalBasisElec}</span>
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Quy định giá bán lẻ điện sinh hoạt 6 bậc thang và cơ chế tính định mức theo số người trong phòng trọ.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{legalBasisVat}</span>
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Thuế GTGT điện là {vatPct}%. Nghiêm cấm hành vi thu tiền điện của người thuê trọ cao hơn biểu giá quy định của nhà nước theo {complianceDecree}.
              </p>
            </div>
          </div>

          {/* Biểu giá điện 6 bậc thang */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 flex items-center gap-1.5 text-sm">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>Giá bán lẻ điện sinh hoạt (VAT {vatPct}%)</span>
              </h3>
              <span className="text-[11px] text-slate-400">Đơn vị: VNĐ / kWh</span>
            </div>

            <div className="overflow-x-auto scrollbar-thin rounded-2xl border border-slate-200">
              <table className="w-full min-w-[480px] sm:min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 whitespace-nowrap">Bậc</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Khoảng tiêu thụ</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Giá gốc</th>
                    <th className="py-2.5 px-3 text-right text-primary-700 whitespace-nowrap">Giá có VAT ({vatPct}%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tiers.map((t, idx) => (
                    <tr key={t.tier_number ?? idx} className={idx === (fallbackTierNumber - 1) ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'}>
                      <td className="py-2 px-3 font-bold text-slate-800 whitespace-nowrap">Bậc {t.tier_number ?? (idx + 1)}</td>
                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{t.range}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700 whitespace-nowrap">{fmtPrice(t.unit_price)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-primary-700 whitespace-nowrap">{fmtPriceVat(t.unit_price, vatRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Trường hợp không đăng ký định mức:</strong> Áp dụng giá điện Bậc {fallbackTierNumber} ({fmtPrice(fallbackTierPrice)}/kWh, có VAT: {fmtPriceVat(fallbackTierPrice, vatRate)}/kWh) cho toàn bộ sản lượng đo được tại công tơ phòng trọ{tier3RuleNote ? ` theo ${tier3RuleNote}` : ''}.
              </span>
            </div>
          </div>

          {/* Biểu giá nước sinh hoạt */}
          <div className="space-y-3">
            <h3 className="font-black text-slate-900 flex items-center gap-1.5 text-sm">
              <Droplets className="w-4 h-4 text-blue-500" />
              <span>Biểu giá nước sinh hoạt</span>
            </h3>

            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Đơn giá nước theo khối</span>
                <span className="text-base font-black text-slate-900">{fmtPrice(waterUnitPrice)} / m³</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Thuế GTGT nước sạch</span>
                <span className="text-base font-black text-slate-900">{Math.round(waterVatRate * 100)}%</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Phí bảo vệ môi trường</span>
                <span className="text-base font-black text-slate-900">{Math.round(waterEnvRate * 100)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="min-h-[44px] w-full sm:w-auto px-6 py-2.5 bg-slate-800 hover:bg-slate-900 active:scale-[0.98] text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center"
          >
            Đã hiểu & Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
