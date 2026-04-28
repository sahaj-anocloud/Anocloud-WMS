'use client';
import React from 'react';
import { useNotifications } from '@/lib/notifications';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const { addNotification } = useNotifications();
  const router = useRouter();
  return (
    <button 
      onClick={() => {
        addNotification('Logging out of SumoSave session...', 'info');
        router.push('/');
      }}
      className="text-sm font-medium bg-white/5 px-4 py-2 rounded-full border border-white/10 hover:bg-white/10 transition-colors cursor-pointer"
    >
      Log Out
    </button>
  );
}
