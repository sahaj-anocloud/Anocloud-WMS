'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useNotifications } from '@/lib/notifications';

interface Document {
  doc_id: string;
  doc_type: string;
  expiry_date: string | null;
  status: string;
  file_s3_key: string;
}

interface ComplianceStatus {
  compliance_status: string;
  missing_docs: string[];
  expired_docs: string[];
}

export default function CompliancePage() {
  const { addNotification } = useNotifications();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [status, setStatus] = useState<ComplianceStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // In production, the vendorId comes from the session/token.
  // In dev, we'll try to find a vendor to display.
  const vendorId = 'c53d1c86-3aae-496e-9010-f3ef04d65888'; // Patanjali (VND-001) for demo

  const fetchCompliance = useCallback(async () => {
    try {
      setLoading(true);
      const [docsRes, statusRes] = await Promise.all([
        api.get<Document[]>(`/api/v1/vendors/${vendorId}/documents`),
        api.get<ComplianceStatus>(`/api/v1/vendors/${vendorId}/compliance-status`),
      ]);
      setDocuments(docsRes);
      setStatus(statusRes);
    } catch (err) {
      addNotification('Failed to fetch compliance status', 'error');
    } finally {
      setLoading(false);
    }
  }, [vendorId, addNotification]);

  useEffect(() => { fetchCompliance(); }, [fetchCompliance]);

  const complianceScore = status ? (
    (1 - (status.missing_docs.length + status.expired_docs.length) / 3) * 100
  ) : 0;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 animate-fade-in">
      <div className="mb-12 flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-bold mb-2">Vendor <span className="text-[#00ff88]">Compliance</span></h1>
          <p className="text-white/60">Manage your statutory documents to ensure uninterrupted supply chain operations.</p>
        </div>
        <button onClick={fetchCompliance} className="btn-ghost text-xs">↻ REFRESH</button>
      </div>

      {loading && <div className="text-center py-20 text-white/20">Loading compliance records…</div>}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2">
            <div className="card rounded-2xl overflow-hidden mb-8">
              <div className="px-6 py-4 border-b border-white/5 bg-white/5">
                <h2 className="font-bold">Required Documents</h2>
              </div>
              <div className="divide-y divide-white/5">
                {documents.length === 0 && <div className="px-6 py-12 text-center text-white/20">No documents uploaded yet.</div>}
                {documents.map((doc) => (
                  <div key={doc.doc_id} className="px-6 py-6 flex items-center justify-between hover:bg-white/[0.01] transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${doc.status === 'Active' ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'bg-white/10 text-white/40'}`}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-bold">{doc.doc_type}</p>
                        <p className="text-xs text-white/40">Expiry: {doc.expiry_date || 'No Expiry'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${doc.status === 'Active' ? 'bg-[#00ff88]/20 text-[#00ff88]' : 'bg-white/10 text-white/40'}`}>
                        {doc.status}
                      </span>
                      <button onClick={() => addNotification(`Downloading ${doc.doc_type}...`)} className="text-white/40 hover:text-white transition-colors cursor-pointer">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {status && status.missing_docs.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6">
                <h3 className="text-amber-400 font-bold mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Missing Mandatory Documents
                </h3>
                <p className="text-xs text-white/60 mb-4">The following documents are required to activate your account:</p>
                <div className="flex gap-2">
                  {status.missing_docs.map(m => (
                    <span key={m} className="px-3 py-1 bg-white/5 rounded-lg text-[10px] font-bold text-white/80">{m}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className={`card rounded-2xl p-6 border-l-4 ${complianceScore === 100 ? 'border-[#00ff88]' : 'border-amber-500'}`}>
              <h3 className="font-bold mb-4">Compliance Score</h3>
              <div className="flex items-end gap-2 mb-4">
                <span className="text-5xl font-bold">{Math.round(complianceScore)}</span>
                <span className="text-white/40 mb-2">/100</span>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-4">
                <div className={`h-full ${complianceScore === 100 ? 'bg-[#00ff88]' : 'bg-amber-500'}`} style={{ width: `${complianceScore}%` }} />
              </div>
              <p className="text-xs text-white/40 italic">
                Status: <span className="text-white font-bold">{status?.compliance_status || 'Pending'}</span>
              </p>
            </div>

            <div className="card rounded-2xl p-8 text-center border border-dashed border-white/10">
              <h3 className="font-bold mb-2 text-white">Upload Document</h3>
              <p className="text-xs text-white/40 mb-6">PDF, JPG, or PNG (Max 10MB)</p>
              <button
                onClick={() => addNotification('File upload selected', 'info')}
                className="w-full py-4 rounded-xl border border-white/5 bg-white/[0.03] hover:bg-[#00ff88]/5 hover:border-[#00ff88]/30 text-white/30 hover:text-[#00ff88] transition-all cursor-pointer font-bold tracking-widest text-[10px]"
              >
                SELECT FILE
              </button>
            </div>

            <div className="card p-5">
              <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-4">Onboarding Progress</h4>
              <div className="space-y-4">
                {[
                  { step: 'Vendor Registration', done: true },
                  { step: 'Document Submission', done: documents.length > 0 },
                  { step: 'Finance Approval', done: status?.compliance_status === 'PendingSecondApproval' || status?.compliance_status === 'Active' },
                  { step: 'Final Activation', done: status?.compliance_status === 'Active' },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${s.done ? 'bg-[#00ff88] text-black' : 'bg-white/5 text-white/20'}`}>
                      {s.done ? '✓' : i + 1}
                    </div>
                    <span className={`text-xs ${s.done ? 'text-white/80' : 'text-white/30'}`}>{s.step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
