/*
 * Copyright (c) 2026 tro. Contributors
 * SPDX-License-Identifier: MIT
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext({
  isConnected: false,
  lastMessage: null,
  sendMessage: () => {},
});

export const WebSocketProvider = ({ children }) => {
  const { token, user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!token) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    // Determine WebSocket endpoint URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let host = window.location.host;
    if (window.location.port === '5173') {
      host = 'localhost:8000';
    }
    const wsUrl = `${protocol}//${host}/api/v1/ws?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        // Set up periodic heartbeat ping
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        if (event.data === 'pong') {
          return;
        }
        try {
          const parsed = JSON.parse(event.data);
          setLastMessage(parsed);

          // Dispatch DOM custom event for lightweight, decoupled component subscriptions
          window.dispatchEvent(
            new CustomEvent('tro:ws_event', {
              detail: parsed,
            })
          );
        } catch {
          // Non-JSON message, ignore
        }
      };

      ws.onerror = () => {
        // Handled in onclose
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Only auto-reconnect if closed unexpectedly and user is still logged in
        // Avoid reconnecting on intentional close or auth rejection (code 4001, 4002, 4003)
        if (token && event.code !== 1000 && event.code !== 4001 && event.code !== 4002 && event.code !== 4003) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 8000);
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };
    } catch {
      setIsConnected(false);
    }
  }, [token]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [connect, user?.id]);

  const sendMessage = useCallback((msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (typeof msg === 'string') {
        wsRef.current.send(msg);
      } else {
        wsRef.current.send(JSON.stringify(msg));
      }
    }
  }, []);

  return (
    <WebSocketContext.Provider value={{ isConnected, lastMessage, sendMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => useContext(WebSocketContext);

/**
 * Hook to subscribe to a specific real-time WebSocket event.
 * @param {string} eventType - The event name to listen for (e.g. 'ADMIN_APPROVED', 'TARIFF_UPDATED')
 * @param {Function} handler - The callback function (data, event) => void
 */
export const useRealtimeEvent = (eventType, handler) => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (event) => {
      const detail = event.detail;
      if (detail && detail.type === eventType) {
        if (handlerRef.current) {
          handlerRef.current(detail.data, detail);
        }
      }
    };

    window.addEventListener('tro:ws_event', listener);
    return () => {
      window.removeEventListener('tro:ws_event', listener);
    };
  }, [eventType]);
};

export default WebSocketContext;
