'use client';

import React, { useState } from 'react';
import { useNotifications } from '@/lib/notifications';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const { addNotification } = useNotifications();
  const router = useRouter();

  const [docs, setDocs] = useState({
    gst: false,
    fssai: false,
    bank: false,
    cheque: false
  });

  const handleUpload = (doc: keyof typeof docs) => {
    addNotification(`Uploading ${doc.toUpperCase()} document...`);
    setTimeout(() => {
      setDocs(prev => ({ ...prev, [doc]: true }));
      addNotification(`Document verified successfully.`, 'success');
    }, 1000);
  };

  const handleSubmit = () => {
    const missing = Object.entries(docs).filter(([_, uploaded]) => !uploaded).map(([name]) => name.toUpperCase());
    
    if (missing.length > 0) {
      addNotification(`Activation blocked. Missing required documents: ${missing.join(', ')}`, 'error');
      return;
    }

    addNotification('Profile activation complete! Redirecting to Dashboard...', 'success');
    router.push('/dashboard');
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 animate-in fade-in duration-700">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold mb-3">Vendor <span className="text-primary glow-text">Onboarding</span></h1>
        <p className="text-white/60 max-w-lg mx-auto">
          Welcome to SumoSave! To activate your vendor profile and begin routing shipments, please upload your compliance documents.
        </p>
      </div>

      <div className="glass rounded-2xl p-8 mb-8">
        <h2 className="text-xl font-bold border-b border-white/10 pb-4 mb-6">Required Documents</h2>
        
        <div className="space-y-4">
          {[
            { id: 'gst', name: 'GST Registration Certificate', desc: 'Valid GSTIN certificate' },
            { id: 'fssai', name: 'FSSAI License', desc: 'Food safety and standards license' },
            { id: 'bank', name: 'Bank Mandate Form', desc: 'Signed NACH/ECS mandate' },
            { id: 'cheque', name: 'Cancelled Cheque', desc: 'Blank cheque with printed entity name' }
          ].map((item) => (
            <div key={item.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${docs[item.id as keyof typeof docs] ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white/40'}`}>
                  {docs[item.id as keyof typeof docs] ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold">{item.name}</h3>
                  <p className="text-xs text-white/40">{item.desc}</p>
                </div>
              </div>
              
              {!docs[item.id as keyof typeof docs] ? (
                <button 
                  onClick={() => handleUpload(item.id as keyof typeof docs)}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-primary/20 hover:text-primary transition-colors text-sm font-medium cursor-pointer"
                >
                  UPLOAD
                </button>
              ) : (
                <span className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-bold border border-primary/20">
                  VERIFIED
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button 
          onClick={handleSubmit}
          className="btn-primary px-8 py-4 rounded-xl text-lg font-bold shadow-[0_0_20px_rgba(0,255,136,0.2)] cursor-pointer"
        >
          COMPLETE ACTIVATION
        </button>
      </div>
    </div>
  );
}
