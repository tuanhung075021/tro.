/*
 * Copyright (c) 2026 tro. Contributors
 * SPDX-License-Identifier: MIT
 */

import React, { useState, useMemo } from 'react';
import {
  Zap,
  ShieldCheck,
  ArrowRight,
  FileSearch,
  CheckCircle2,
  Building2,
  Users,
  Calculator,
  Check,
  Sparkles,
  Scale,
  FileText,
} from 'lucide-react';

export default function LandingPage({ onOpenAuth, onOpenPublic }) {
  // --------------------------------------------------------------------------
  // Interactive Showcase State (Generic Demo Preview)
  // --------------------------------------------------------------------------
  const [activeTariffMode, setActiveTariffMode] = useState('statutory'); // 'statutory' | 'flat'

  // Demo room parameters (Generic Demo: Room 102, 2 tenants, 145 kWh)
  const demoElecStart = 150;
  const demoElecEnd = 295;
  const demoConsumption = demoElecEnd - demoElecStart; // 145 kWh
  const demoFlatRate = 3800;

  // 145 kWh statutory calculation (Quota = 1/2 household for 2 people)
  // Tier 1: 50 kWh @ 1.984 = 99.200 đ
  // Tier 2: 50 kWh @ 2.050 = 102.500 đ
  // Tier 3: 45 kWh @ 2.380 = 107.100 đ
  const demoTier1 = 50 * 1984; // 99.200
  const demoTier2 = 50 * 2050; // 102.500
  const demoTier3 = 45 * 2380; // 107.100
  const demoPreTax = demoTier1 + demoTier2 + demoTier3; // 308.800
  const demoVat = Math.round(demoPreTax * 0.08); // 24.704
  const demoStatutoryTotal = demoPreTax + demoVat; // 333.504

  // Flat rate calculation
  const demoFlatTotal = demoConsumption * demoFlatRate; // 551.000
  const demoDiff = demoFlatTotal - demoStatutoryTotal; // 217.496

  // --------------------------------------------------------------------------
  // Interactive Simulator State (Lower Section)
  // --------------------------------------------------------------------------
  const [elecStart, setElecStart] = useState(150);
  const [elecEnd, setElecEnd] = useState(295);
  const [peopleCount, setPeopleCount] = useState(2);
  const [actualElecRate, setActualElecRate] = useState(3800);

  const consumptionKwh = Math.max(0, elecEnd - elecStart);

  const statutoryResult = useMemo(() => {
    const quota = Math.max(1, Math.ceil(peopleCount / 4));
    const baseTiers = [
      { num: 1, limit: 50, price: 1984 },
      { num: 2, limit: 50, price: 2050 },
      { num: 3, limit: 100, price: 2380 },
      { num: 4, limit: 100, price: 2998 },
      { num: 5, limit: 100, price: 3350 },
      { num: 6, limit: Infinity, price: 3460 },
    ];

    let remaining = consumptionKwh;
    let preTax = 0;
    const tierBreakdowns = [];

    for (const t of baseTiers) {
      if (remaining <= 0) break;
      const tierCapacity = t.limit === Infinity ? Infinity : t.limit * quota;
      const usedInTier = Math.min(remaining, tierCapacity);
      const amount = usedInTier * t.price;
      tierBreakdowns.push({
        num: t.num,
        kwh: usedInTier,
        price: t.price,
        amount,
      });
      preTax += amount;
      remaining -= usedInTier;
    }

    const vat = preTax * 0.08;
    const totalStatutory = Math.round(preTax + vat);
    const actualCollected = Math.round(consumptionKwh * actualElecRate);
    const diff = actualCollected - totalStatutory;
    const isOvercharged = diff > 0;

    return {
      quota,
      preTax,
      vat,
      totalStatutory,
      actualCollected,
      diff,
      isOvercharged,
      tierBreakdowns,
    };
  }, [consumptionKwh, peopleCount, actualElecRate]);

  return (
    <div className="space-y-16 sm:space-y-24 py-4 sm:py-8">
      {/* ==================================================================== */}
      {/* 1. HERO SECTION: Light, Generic & Clear Domain Logic                 */}
      {/* ==================================================================== */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Soft Ambient Diffuse Glows */}
        <div className="absolute inset-0 pointer-events-none -z-10 overflow-hidden">
          <div className="absolute -top-16 left-1/4 w-96 h-96 bg-emerald-100/40 rounded-full blur-3xl opacity-60" />
          <div className="absolute top-20 right-10 w-96 h-96 bg-teal-100/30 rounded-full blur-3xl opacity-50" />
          <div className="absolute -bottom-10 left-1/3 w-80 h-80 bg-slate-100/50 rounded-full blur-3xl opacity-60" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* LEFT COLUMN: Clear, Non-Hyperbolic Copywriting & Primary CTAs */}
          <div className="lg:col-span-6 space-y-6 text-left">
            {/* Generic Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-100 border border-slate-200/90 text-slate-700 text-xs sm:text-sm font-semibold tracking-wide">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Hỗ trợ biểu giá điện 6 bậc & đơn giá riêng</span>
            </div>

            {/* Slogan chính */}
            <div className="space-y-3">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.12]">
                Minh bạch Chi phí <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600">
                  Điện Nước
                </span>
              </h1>

              {/* Mô tả chính */}
              <p className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight leading-snug">
                Hệ thống Quản lý Lưu trú & Đối chiếu Chi phí Điện Nước Minh bạch
              </p>
            </div>

            {/* Mô tả phụ */}
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
              Tự động đối chiếu chỉ số công tơ với biểu giá bậc thang quy định, đảm bảo tính chính xác và rõ ràng cho cả chủ trọ và người thuê.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <button
                type="button"
                onClick={onOpenAuth}
                className="min-h-[48px] px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold rounded-2xl shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/25 transition-all flex items-center gap-2 text-sm sm:text-base group"
              >
                <span>Trải nghiệm ngay</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                type="button"
                onClick={onOpenPublic}
                className="min-h-[48px] px-6 py-3 bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-800 font-bold rounded-2xl border border-slate-300 shadow-sm hover:border-slate-400 transition-all flex items-center gap-2 text-sm sm:text-base"
              >
                <FileSearch className="w-4 h-4 text-emerald-600" />
                <span>Tra cứu hóa đơn</span>
              </button>
            </div>

            {/* Trust Indicators */}
            <div className="pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-200/80">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Tính đúng biểu giá bậc thang</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Đối chiếu số liệu rõ ràng</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Tra cứu trực tuyến tiện lợi</span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Logical Interactive Invoice Demo Card */}
          <div className="lg:col-span-6 relative">
            {/* Top Floating Satellite Chip */}
            <div className="hidden sm:flex absolute -top-5 -right-2 z-20 items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/95 border border-slate-200 shadow-md backdrop-blur-md animate-float-slow text-left">
              <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <Calculator className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tính toán tự động</div>
                <div className="text-xs font-bold text-slate-800">Chia bậc theo số người</div>
              </div>
            </div>

            {/* Bottom Floating Satellite Chip */}
            <div className="hidden sm:flex absolute -bottom-5 -left-4 z-20 items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/95 border border-slate-200 shadow-md backdrop-blur-md animate-float-reverse text-left">
              <div className="w-7 h-7 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Phiếu tính mẫu</div>
                <div className="text-xs font-bold text-emerald-700 font-mono">Mã tra cứu: HD102</div>
              </div>
            </div>

            {/* Main Interactive Demo Card */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/60 p-5 sm:p-6 space-y-4 text-left relative overflow-hidden">
              {/* Top Accent Line */}
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500" />

              {/* Card Header: Generic Demo Information */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800">Phòng mẫu 102 • Khu trọ A</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">Kỳ thanh toán: Tháng 09/2026 • 2 người</span>
                </div>

                {/* Method Switcher Tabs */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setActiveTariffMode('statutory')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      activeTariffMode === 'statutory'
                        ? 'bg-white text-emerald-700 shadow-sm font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Tính theo bậc
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTariffMode('flat')}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      activeTariffMode === 'flat'
                        ? 'bg-white text-slate-900 shadow-sm font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Giá cố định
                  </button>
                </div>
              </div>

              {/* Meter Readings Banner (Logical beginning, ending, and consumption) */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-200/80 text-center">
                <div className="space-y-0.5">
                  <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500">Chỉ số cũ</div>
                  <div className="text-base sm:text-lg font-black text-slate-800 font-mono">
                    {demoElecStart} <span className="text-[10px] font-normal text-slate-500">kWh</span>
                  </div>
                </div>
                <div className="space-y-0.5 border-x border-slate-200">
                  <div className="text-[10px] sm:text-[11px] font-semibold text-slate-500">Chỉ số mới</div>
                  <div className="text-base sm:text-lg font-black text-slate-800 font-mono">
                    {demoElecEnd} <span className="text-[10px] font-normal text-slate-500">kWh</span>
                  </div>
                </div>
                <div className="space-y-0.5 bg-emerald-50/70 rounded-xl py-0.5">
                  <div className="text-[10px] sm:text-[11px] font-bold text-emerald-800">Sản lượng</div>
                  <div className="text-base sm:text-lg font-black text-emerald-700 font-mono">
                    {demoConsumption} <span className="text-[10px] font-bold text-emerald-600">kWh</span>
                  </div>
                </div>
              </div>

              {/* Dynamic Calculation Details Based on Active Tab */}
              {activeTariffMode === 'statutory' ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">Phân bổ 145 kWh theo các bậc:</span>
                    <span className="text-slate-500 text-[11px]">Định mức 2 người lưu trú</span>
                  </div>

                  {/* Horizontal Segmented Progress Bar */}
                  <div className="h-2 w-full bg-slate-100 rounded-full flex overflow-hidden">
                    <div style={{ width: '34.5%' }} className="h-full bg-emerald-500" title="Bậc 1: 50 kWh" />
                    <div style={{ width: '34.5%' }} className="h-full bg-teal-500" title="Bậc 2: 50 kWh" />
                    <div style={{ width: '31%' }} className="h-full bg-sky-500" title="Bậc 3: 45 kWh" />
                  </div>

                  {/* Tier Rows */}
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/70">
                      <span className="text-slate-600">Bậc 1 (0 - 50 kWh) • 1.984 đ/kWh</span>
                      <span className="font-mono font-bold text-slate-800">50 kWh = {demoTier1.toLocaleString('vi-VN')} đ</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/70">
                      <span className="text-slate-600">Bậc 2 (51 - 100 kWh) • 2.050 đ/kWh</span>
                      <span className="font-mono font-bold text-slate-800">50 kWh = {demoTier2.toLocaleString('vi-VN')} đ</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/70">
                      <span className="text-slate-600">Bậc 3 (101 - 145 kWh) • 2.380 đ/kWh</span>
                      <span className="font-mono font-bold text-slate-800">45 kWh = {demoTier3.toLocaleString('vi-VN')} đ</span>
                    </div>
                  </div>

                  {/* Subtotal & VAT Breakdown */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                    <span>Tiền điện: {demoPreTax.toLocaleString('vi-VN')} đ</span>
                    <span>Thuế GTGT (8%): {demoVat.toLocaleString('vi-VN')} đ</span>
                  </div>

                  {/* Statutory Total Banner */}
                  <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-950">Tổng tiền theo bậc thang:</span>
                    <span className="text-lg sm:text-xl font-black text-emerald-700 font-mono">
                      {demoStatutoryTotal.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">Tính theo đơn giá cố định thỏa thuận:</span>
                    <span className="text-slate-500 text-[11px]">Đồng giá toàn bộ sản lượng</span>
                  </div>

                  {/* Flat Rate Details Box */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Tổng sản lượng tiêu thụ:</span>
                      <span className="font-mono font-bold text-slate-800">{demoConsumption} kWh</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">Đơn giá áp dụng:</span>
                      <span className="font-mono font-bold text-slate-800">{demoFlatRate.toLocaleString('vi-VN')} đ/kWh</span>
                    </div>
                    <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                      Công thức tính: {demoConsumption} kWh × {demoFlatRate.toLocaleString('vi-VN')} đ = {demoFlatTotal.toLocaleString('vi-VN')} đ
                    </div>
                  </div>

                  {/* Flat Total Banner */}
                  <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Tổng tiền theo giá cố định:</span>
                    <span className="text-lg sm:text-xl font-black text-slate-900 font-mono">
                      {demoFlatTotal.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>
              )}

              {/* Comparison Strip at the Bottom */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-slate-500 shrink-0" />
                  <div>
                    <span className="text-slate-500 block text-[11px]">So sánh 2 cách tính:</span>
                    <span className="font-bold text-slate-800">
                      Bậc thang: {demoStatutoryTotal.toLocaleString('vi-VN')} đ vs Giá khoán: {demoFlatTotal.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] text-slate-500 block">Chênh lệch</span>
                  <span className="font-mono font-bold text-slate-700">
                    {demoDiff.toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 2. INTERACTIVE SIMULATOR: Straightforward, Educational Tool          */}
      {/* ==================================================================== */}
      <section className="max-w-5xl mx-auto bg-white rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden">
        {/* Section Header */}
        <div className="bg-slate-900 p-5 sm:p-7 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 text-left">
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                <Sparkles className="w-4 h-4" />
                <span>Công cụ đối chiếu</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black">
                Mô phỏng Tính toán Chi phí Điện Nước
              </h2>
            </div>
            <p className="text-xs text-slate-300 max-w-xs text-left sm:text-right leading-relaxed">
              Nhập thử số công tơ và đơn giá thực tế để đối chiếu tiền điện theo biểu giá bậc thang.
            </p>
          </div>
        </div>

        <div className="p-5 sm:p-8 space-y-6">
          {/* Controls Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5 text-left">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Chỉ số đầu kỳ (kWh)</span>
              </label>
              <input
                type="number"
                min="0"
                value={elecStart}
                onChange={(e) => setElecStart(Number(e.target.value) || 0)}
                className="w-full min-h-[44px] bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5 text-left">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                <span>Chỉ số cuối kỳ (kWh)</span>
              </label>
              <input
                type="number"
                min={elecStart}
                value={elecEnd}
                onChange={(e) => setElecEnd(Number(e.target.value) || 0)}
                className="w-full min-h-[44px] bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5 text-left">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                <span>Số người lưu trú</span>
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={peopleCount}
                onChange={(e) => setPeopleCount(Math.max(1, Number(e.target.value) || 1))}
                className="w-full min-h-[44px] bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5 text-left">
              <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-emerald-600" />
                <span>Đơn giá thu thực tế (đ/kWh)</span>
              </label>
              <input
                type="number"
                step="100"
                value={actualElecRate}
                onChange={(e) => setActualElecRate(Number(e.target.value) || 0)}
                className="w-full min-h-[44px] bg-white border border-slate-300 rounded-xl px-3 py-2 text-base font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Result Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
            {/* Step 1 */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">1. Sản lượng tiêu thụ</span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full">
                  Điện năng
                </span>
              </div>

              <div className="py-2 flex flex-col items-center justify-center">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" stroke="#e2e8f0" strokeWidth="8" fill="transparent" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="#10b981"
                      strokeWidth="8"
                      strokeDasharray="251.2"
                      strokeDashoffset={Math.max(0, 251.2 - (Math.min(consumptionKwh, 300) / 300) * 251.2)}
                      strokeLinecap="round"
                      fill="transparent"
                      className="transition-all duration-500 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl sm:text-3xl font-black text-slate-900">{consumptionKwh}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">kWh</span>
                  </div>
                </div>
              </div>

              <div className="text-center text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200">
                {elecEnd} - {elecStart} = <strong>{consumptionKwh} kWh</strong>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase">2. Áp biểu giá bậc thang</span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-teal-100 text-teal-800 rounded-full">
                  Chuẩn quy định
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                {statutoryResult.tierBreakdowns.map((t) => (
                  <div key={t.num} className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600">Bậc {t.num} ({t.price.toLocaleString('vi-VN')} đ):</span>
                    <span className="font-bold text-slate-900 font-mono">
                      {t.kwh} kWh = {t.amount.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                ))}
                <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">VAT (8%):</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {Math.round(statutoryResult.vat).toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                <span className="text-xs text-slate-500">Tổng theo chuẩn:</span>
                <span className="text-sm sm:text-base font-black text-emerald-700 font-mono">
                  {statutoryResult.totalStatutory.toLocaleString('vi-VN')} đ
                </span>
              </div>
            </div>

            {/* Step 3 */}
            <div
              className={`p-5 rounded-2xl border-2 flex flex-col justify-between space-y-3 text-left transition-all ${
                statutoryResult.isOvercharged
                  ? 'bg-rose-50/80 border-rose-300 text-rose-950'
                  : 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider">3. Đối chiếu</span>
                <span
                  className={`px-2.5 py-0.5 text-[10px] font-black rounded-full uppercase ${
                    statutoryResult.isOvercharged
                      ? 'bg-rose-200 text-rose-900'
                      : 'bg-emerald-200 text-emerald-900'
                  }`}
                >
                  {statutoryResult.isOvercharged ? 'Có chênh lệch' : 'Khớp chuẩn'}
                </span>
              </div>

              <div className="space-y-1.5 text-center py-2">
                {statutoryResult.isOvercharged ? (
                  <>
                    <p className="text-xs font-bold text-rose-700 uppercase">Chênh lệch so với bậc thang</p>
                    <p className="text-xl sm:text-2xl font-black text-rose-600 font-mono">
                      +{statutoryResult.diff.toLocaleString('vi-VN')} đ
                    </p>
                    <p className="text-[11px] text-rose-700/90 leading-tight">
                      Đơn giá thực tế đang cao hơn mức tính theo biểu giá bậc thang quy định
                    </p>
                  </>
                ) : (
                  <>
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 mb-1">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-emerald-700 uppercase">Khớp biểu giá quy định</p>
                    <p className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">0 đ chênh lệch</p>
                    <p className="text-[11px] text-emerald-700/90 leading-tight">
                      Khoản thu tương đương với mức tính theo biểu giá bậc thang
                    </p>
                  </>
                )}
              </div>

              <div className="bg-white/80 backdrop-blur p-2.5 rounded-xl border text-xs flex justify-between">
                <span className="text-slate-600">Thực thu dự tính:</span>
                <span className="font-black text-slate-900 font-mono">
                  {statutoryResult.actualCollected.toLocaleString('vi-VN')} đ
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 3. VALUE PILLARS: Practical & Objective Feature Overview             */}
      {/* ==================================================================== */}
      <section className="max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>Tính năng chính</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Giải pháp Quản lý Thuận tiện & Rõ ràng
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            Hỗ trợ chủ nhà và người thuê theo dõi số liệu điện nước minh bạch, hạn chế nhầm lẫn trong quá trình tính toán.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {/* Card 1: Chủ trọ */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow space-y-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900">
              Quản lý cho Chủ nhà
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Tính tiền điện nước và xuất hóa đơn từng phòng nhanh chóng. Hỗ trợ cả hai hình thức: tính theo bậc thang quy định hoặc đơn giá thỏa thuận riêng.
            </p>
            <div className="pt-1 flex items-center gap-2 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Dễ sử dụng, giảm nhầm lẫn khi ghi chép thủ công</span>
            </div>
          </div>

          {/* Card 2: Người thuê */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow space-y-3.5">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900">
              Rõ ràng cho Người thuê
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Nắm rõ số công tơ đầu kỳ, cuối kỳ và cách tính tiền cụ thể của từng tháng. Mọi khoản thu đều có số liệu chi tiết, dễ dàng kiểm tra.
            </p>
            <div className="pt-1 flex items-center gap-2 text-xs font-bold text-teal-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Rõ ràng chi tiết từng khoản cần thanh toán</span>
            </div>
          </div>

          {/* Card 3: Tra cứu công khai */}
          <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow space-y-3.5">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-100">
              <FileSearch className="w-6 h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-black text-slate-900">
              Tra cứu Trực tuyến Thuận tiện
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Xem hóa đơn trực tiếp trên điện thoại qua mã tra cứu 4 ký tự hoặc đường dẫn nhanh mà không cần cài đặt thêm ứng dụng.
            </p>
            <div className="pt-1 flex items-center gap-2 text-xs font-bold text-sky-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Tra cứu nhanh trên mọi thiết bị</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
