'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

type NotifType = 'info' | 'success' | 'warning' | 'error';

interface Notification {
  id: string;
  message: string;
  type: NotifType;
  timestamp: string;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (msg: string, type?: NotifType) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const TYPE_CONFIG: Record<NotifType, { border: string; icon: string; bg: string; text: string }> = {
  info:    { border: '#3b82f6', icon: 'ℹ', bg: 'rgba(59,130,246,0.08)',  text: '#93c5fd' },
  success: { border: '#00ff88', icon: '✓', bg: 'rgba(0,255,136,0.08)',   text: '#00ff88' },
  warning: { border: '#f59e0b', icon: '⚠', bg: 'rgba(245,158,11,0.08)', text: '#fbbf24' },
  error:   { border: '#ef4444', icon: '✕', bg: 'rgba(239,68,68,0.08)',  text: '#f87171' },
};

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((message: string, type: NotifType = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [
      { id, message, type, timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
      ...prev,
    ]);
    // Auto-dismiss after 4s
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: '340px' }}>
        {notifications.slice(0, 4).map((n, i) => {
          const cfg = TYPE_CONFIG[n.type];
          return (
            <div
              key={n.id}
              className="pointer-events-auto animate-fade-in rounded-xl overflow-hidden"
              style={{
                background: 'rgba(13,17,23,0.95)',
                border: `1px solid ${cfg.border}30`,
                borderLeft: `3px solid ${cfg.border}`,
                backdropFilter: 'blur(16px)',
                transform: `translateY(${i * -2}px)`,
                boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)`,
              }}
            >
              <div className="flex items-start gap-3 p-3.5">
                <span className="text-sm flex-shrink-0 mt-0.5" style={{ color: cfg.text }}>{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/90 leading-snug">{n.message}</p>
                  <p className="text-[10px] text-white/30 mt-0.5 font-mono">{n.timestamp}</p>
                </div>
              </div>
              <div
                className="h-0.5 animate-[progressFill_4s_linear_forwards]"
                style={{ background: cfg.border, '--progress-width': '0%' } as React.CSSProperties}
              />
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};
