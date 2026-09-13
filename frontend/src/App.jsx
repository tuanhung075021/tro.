/*
 * Copyright (c) 2026 tro. Contributors
 * SPDX-License-Identifier: MIT
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { ToastProvider } from './context/ToastContext';
import { TariffProvider } from './context/TariffContext';
import Navbar from './components/Navbar';
import LandingPage from './components/LandingPage';
import AuthModal from './components/AuthModal';
import LandlordDashboard from './components/LandlordDashboard';
import TenantDashboard from './components/TenantDashboard';
import AdminDashboard from './components/AdminDashboard';
import PendingAdminPage from './components/PendingAdminPage';
import PublicInvoiceView from './components/PublicInvoiceView';
import TariffModal from './components/TariffModal';
import { Zap } from 'lucide-react';

function MainLayout() {
  const { user, isAuthenticated, isLandlord, isTenant, isAdmin, isRootAdmin, isPendingAdmin, loading } = useAuth();
  const [currentView, setCurrentView] = useState('home'); // 'home' | 'public'
  const [publicToken, setPublicToken] = useState('');
  const [showTariffModal, setShowTariffModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Extract public token from URL (path /public/:token, hash #public/:token, or search ?public=token)
  const parseUrlRoute = useCallback(() => {
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;

    // Check query params: ?public=xyz or ?token=xyz
    const queryToken = searchParams.get('public') || searchParams.get('token');
    if (queryToken) {
      setPublicToken(queryToken);
      setCurrentView('public');
      return;
    }

    // Check path: /public/:token
    const publicMatch = pathname.match(/^\/public\/([^/?#]+)/);
    if (publicMatch && publicMatch[1]) {
      setPublicToken(decodeURIComponent(publicMatch[1]));
      setCurrentView('public');
      return;
    }

    // Check path: /public or /public/ (open search portal)
    if (pathname === '/public' || pathname === '/public/') {
      setPublicToken('');
      setCurrentView('public');
      return;
    }

    // Check hash: #public/:token or #/public/:token
    const hashMatch = hash.match(/^#\/?public\/([^/?#]+)/);
    if (hashMatch && hashMatch[1]) {
      setPublicToken(decodeURIComponent(hashMatch[1]));
      setCurrentView('public');
      return;
    }

    // Fallback: When navigating back to root or other non-public URLs
    setPublicToken('');
    setCurrentView((prev) => (prev === 'public' ? 'home' : prev));
  }, []);

  useEffect(() => {
    parseUrlRoute();

    const handleLocationChange = () => {
      parseUrlRoute();
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [parseUrlRoute]);

  const handleViewPublicInvoice = (shareToken) => {
    setPublicToken(shareToken);
    setCurrentView('public');
    window.history.pushState(null, '', `/public/${encodeURIComponent(shareToken)}`);
  };

  const handleBackToHome = () => {
    setPublicToken('');
    setCurrentView('home');
    window.history.pushState(null, '', '/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-600 text-white shadow-xl shadow-primary-500/25 animate-pulse">
            <Zap className="w-7 h-7 fill-current" />
          </div>
          <p className="text-sm font-bold text-slate-700">Đang khởi tạo hệ thống tro. ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <div className="flex-1 flex flex-col">
        <Navbar
          currentView={currentView}
          setCurrentView={setCurrentView}
          onOpenTariffModal={() => setShowTariffModal(true)}
          onOpenAuthModal={() => setShowAuthModal(true)}
          onSelectInvoice={handleViewPublicInvoice}
        />

        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
          {/* VIEW ROUTER */}
          {currentView === 'public' ? (
            <PublicInvoiceView initialToken={publicToken} onBackToHome={handleBackToHome} />
          ) : !isAuthenticated ? (
            <LandingPage
              onOpenAuth={() => setShowAuthModal(true)}
              onOpenPublic={() => {
                setCurrentView('public');
                window.history.pushState(null, '', '/public');
              }}
            />
          ) : (isAdmin || isRootAdmin) ? (
            <AdminDashboard />
          ) : isPendingAdmin ? (
            <PendingAdminPage />
          ) : isLandlord ? (
            <LandlordDashboard onViewPublicInvoice={handleViewPublicInvoice} />
          ) : isTenant ? (
            <TenantDashboard onViewPublicInvoice={handleViewPublicInvoice} />
          ) : (
            <div className="p-8 bg-white rounded-3xl border border-slate-200 text-center">
              <p className="text-slate-700 font-bold">Tài khoản chưa được phân vai trò hợp lệ.</p>
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="relative z-0 mt-12 sm:mt-16 bg-white border-t border-slate-200 py-6 text-xs text-slate-500 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <span className="text-base font-black text-slate-900">
              tro<span className="text-primary-600">.</span>
            </span>
            <span> Hệ thống Quản lý Lưu trú & Đối chiếu Chi phí Điện Nước Minh bạch</span>
          </div>

          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span>Giấy phép MIT</span>
            <span>•</span>
            <span>© 2026 tro. Contributors</span>
          </div>
        </div>
      </footer>

      {/* Consolidated Modals */}
      <TariffModal
        isOpen={showTariffModal}
        onClose={() => setShowTariffModal(false)}
      />

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={() => {
          setShowAuthModal(false);
          setCurrentView('home');
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <ToastProvider>
          <TariffProvider>
            <MainLayout />
          </TariffProvider>
        </ToastProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
}
