/*
 * Copyright (c) 2026 tro. Contributors
 * SPDX-License-Identifier: MIT
 */

/**
 * TariffContext — Singleton React context for the active statutory tariff configuration.
 *
 * Fetches GET /config once on mount (for authenticated users), then re-polls every 60s.
 * On version change, fires a custom DOM event so Navbar can trigger notification re-poll.
 * Provides useTariff() hook giving:
 *   - tariffConfig : SystemConfigOut | null
 *   - loadingTariff : boolean
 *   - refetchTariff : () => void   (manual refresh)
 *   - maxTierPrice  : number       (unit_price of highest tier, for compliance checks)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { systemConfig as configApi } from '../services/api';

const TariffContext = createContext(null);

const POLL_INTERVAL_MS = 60_000; // 60 seconds

export function TariffProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [tariffConfig, setTariffConfig] = useState(null);
  const [loadingTariff, setLoadingTariff] = useState(false);
  const prevVersionRef = useRef(null);

  const fetchTariff = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingTariff(true);
      try {
        const cfg = await configApi.get();
        if (!cfg) return;

        setTariffConfig(cfg);

        // Detect version change (skip on very first load — prevVersionRef is null)
        if (
          prevVersionRef.current !== null &&
          cfg.tariff_version &&
          cfg.tariff_version !== prevVersionRef.current
        ) {
          // Dispatch a custom DOM event — Navbar/components listen without tight coupling.
          window.dispatchEvent(
            new CustomEvent('tro:tariff_version_changed', {
              detail: {
                newVersion: cfg.tariff_version,
                oldVersion: prevVersionRef.current,
              },
            })
          );
        }

        prevVersionRef.current = cfg.tariff_version || null;
      } catch {
        // Fail silently — tariff data is best-effort, not blocking UI
      } finally {
        if (!silent) setLoadingTariff(false);
      }
    },
    []
  );

  // Initial fetch on mount & whenever auth changes
  useEffect(() => {
    fetchTariff(false);
  }, [isAuthenticated, fetchTariff]);

  // Background poll every 60s (silent — no loading spinner)
  useEffect(() => {
    const timer = setInterval(() => fetchTariff(true), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchTariff]);

  /** Highest tier unit_price — ceiling for compliance alert in LandlordDashboard */
  const maxTierPrice = React.useMemo(() => {
    if (!tariffConfig?.tiers || tariffConfig.tiers.length === 0) return 3460;
    const prices = tariffConfig.tiers.map((t) => Number(t.unit_price || 0));
    return Math.max(...prices);
  }, [tariffConfig]);

  /** Fallback tier number applied when no quota registered (default 3) */
  const fallbackTierNumber = tariffConfig?.fallback_tier_number ?? 3;

  /** Fallback price applied when no quota registered */
  const fallbackTierPrice = React.useMemo(() => {
    if (tariffConfig?.fallback_flat_price != null && Number(tariffConfig.fallback_flat_price) > 0) {
      return Number(tariffConfig.fallback_flat_price);
    }
    if (tariffConfig?.tiers && tariffConfig.tiers.length > 0) {
      const match = tariffConfig.tiers.find(
        (t) => (t.tier_number ?? 0) === fallbackTierNumber
      );
      if (match?.unit_price != null) return Number(match.unit_price);
    }
    return tariffConfig?.electricity_tier3_price ?? 2380;
  }, [tariffConfig, fallbackTierNumber]);

  const legalBasisElec = tariffConfig?.legal_basis_elec || 'QĐ 1279/QĐ-BCT & TT 60/2025/TT-BCT';
  const legalBasisVat = tariffConfig?.legal_basis_vat || 'Nghị quyết 204/2025/QH15';
  const complianceDecree = tariffConfig?.compliance_decree || 'Nghị định 104/2022/NĐ-CP & NĐ 17/2022/NĐ-CP';
  const penaltyText = tariffConfig?.penalty_text || '20.000.000 đ đến 30.000.000 đ';
  const tier3RuleNote = tariffConfig?.tier3_rule_note || 'Khoản 4 Điều 10 Thông tư 60/2025/TT-BCT';

  const value = {
    tariffConfig,
    loadingTariff,
    refetchTariff: () => fetchTariff(false),
    maxTierPrice,
    fallbackTierNumber,
    fallbackTierPrice,
    legalBasisElec,
    legalBasisVat,
    complianceDecree,
    penaltyText,
    tier3RuleNote,
  };

  return (
    <TariffContext.Provider value={value}>{children}</TariffContext.Provider>
  );
}

export function useTariff() {
  const ctx = useContext(TariffContext);
  if (!ctx) {
    throw new Error('useTariff must be used within a TariffProvider');
  }
  return ctx;
}
