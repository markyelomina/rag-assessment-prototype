'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabaseClient';

export default function AdminOverviewPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [usageData, setUsageData] = useState<any[]>([]);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);

  useEffect(() => {
    const runGlobalDiagnosticsAndFetchData = async () => {
      setIsLoading(true);
      const logs: string[] = [];
      let isDegraded = false;

      try {
        // 1. ACTIVE PING: Database Connection
        const dbStart = Date.now();
        const { error: dbError } = await supabase.auth.getSession();
        const dbLatency = Date.now() - dbStart;
        
        if (dbError || dbLatency > 2000) {
          isDegraded = true;
          logs.push(`⚠️ Database degraded: Latency ${dbLatency}ms or connection failed.`);
        } else {
          logs.push(`✅ Database operational (${dbLatency}ms latency).`);
        }

        // 2. FETCH TRUE TELEMETRY
        let telemetryData;
        try {
          const res = await fetch('/api/telemetry');
          if (res.ok) {
            telemetryData = await res.json();
            logs.push(`✅ Telemetry services connected.`);
            logs.push(`✅ Storage & quotas calculated securely.`);
          } else {
            const errData = await res.json();
            throw new Error(errData.error || 'API returned non-200 status');
          }
        } catch (e: any) {
          isDegraded = true;
          logs.push(`⚠️ Telemetry endpoint unreachable: ${e.message}`);
          
          telemetryData = {
            studentCount: 0,
            facultyCount: 0,
            storageUsedGb: 0.0,
            storageTotalGb: 1.0,
            genRequestsK: 0.0,
            evalRequestsK: 0.0,
            weeklyChart: [
              { day: 'Mon', tokens: 0 }, { day: 'Tue', tokens: 0 }, { day: 'Wed', tokens: 0 },
              { day: 'Thu', tokens: 0 }, { day: 'Fri', tokens: 0 }, { day: 'Sat', tokens: 0 }, { day: 'Sun', tokens: 0 }
            ],
            backendHealth: { aiWorker: 'Offline', stalledIngestionJobs: 0 }
          };
        }

        // 3. Evaluate Backend Infrastructure Health
        if (telemetryData.backendHealth?.aiWorker !== "Operational") {
           isDegraded = true;
           logs.push(`⚠️ AI Worker Degraded: ${telemetryData.backendHealth?.aiWorker}`);
        } else {
           logs.push(`✅ AI Worker operational (Heartbeat verified).`);
        }

        if (telemetryData.backendHealth?.stalledIngestionJobs > 0) {
           isDegraded = true;
           logs.push(`⚠️ Ingestion Warning: ${telemetryData.backendHealth.stalledIngestionJobs} documents stalled in processing.`);
        }

        setSystemStats({
          activeStudents: telemetryData.studentCount,
          activeFaculty: telemetryData.facultyCount,
          systemHealth: isDegraded ? 'Degraded Performance' : 'All Systems Operational',
          storageUsage: { 
            used: telemetryData.storageUsedGb, 
            total: telemetryData.storageTotalGb, 
            unit: 'GB' 
          },
          apiQuota: { 
            generation: { used: telemetryData.genRequestsK, total: 150.0, unit: 'k' },
            evaluation: { used: telemetryData.evalRequestsK, total: 150.0, unit: 'k' }
          }
        });

        setUsageData(telemetryData.weeklyChart);
        setDiagnosticLogs(logs);

      } catch (error) {
        console.error('Failed to execute global diagnostics', error);
        setSystemStats((prev: any) => ({ ...prev, systemHealth: 'System Failure Critical' }));
      } finally {
        setIsLoading(false);
      }
    };

    runGlobalDiagnosticsAndFetchData();
  }, []);

  return (
    <>
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Global System Overview</h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">Monitor platform health and resource consumption.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => router.push('/admin/users/add')}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors shadow-sm whitespace-nowrap"
          >
            Add New User
          </button>
          <button 
            onClick={() => router.push('/admin/rag')}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700 transition-colors shadow-sm whitespace-nowrap"
          >
            Upload Document
          </button>
        </div>
      </div>

      {isLoading || !systemStats ? (
        <div className="flex flex-col items-center justify-center py-20">
          <svg className="animate-spin h-10 w-10 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-slate-500 font-bold">Running active global diagnostics...</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Active Students</span>
              <p className="text-4xl font-bold text-slate-800 mt-2">{systemStats.activeStudents}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Faculty</span>
              <p className="text-4xl font-bold text-blue-600 mt-2">{systemStats.activeFaculty}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">System Health Status</span>
                <p className={`text-2xl font-bold mt-1 ${systemStats.systemHealth === 'Degraded Performance' || systemStats.systemHealth === 'System Failure Critical' ? 'text-rose-600' : 'text-slate-800'}`}>
                  {systemStats.systemHealth}
                </p>
                <div className="mt-2 space-y-1">
                  {diagnosticLogs.map((log, i) => (
                    <p key={i} className="text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">{log}</p>
                  ))}
                </div>
              </div>
              <div className={`h-14 w-14 rounded-full flex items-center justify-center border-4 shrink-0 ${systemStats.systemHealth === 'All Systems Operational' ? 'bg-emerald-100 border-emerald-50' : 'bg-rose-100 border-rose-50'}`}>
                <div className={`h-6 w-6 rounded-full ${systemStats.systemHealth === 'All Systems Operational' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-pulse'}`}></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="lg:col-span-2 bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex flex-col h-80">
              <div className="mb-4">
                <h3 className="font-bold text-slate-800">Weekly AI Token Consumption</h3>
                <p className="text-xs text-slate-500 font-bold">Displayed in thousands of tokens processed (Fetched via API).</p>
              </div>
              <div className="flex-1 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={usageData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 'bold' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12, fontWeight: 'bold' }} />
                    <Tooltip cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontWeight: 'bold' }} />
                    <Line type="monotone" dataKey="tokens" name="Tokens (k)" stroke="#9333ea" strokeWidth={3} dot={{ r: 4, fill: '#9333ea', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-1 space-y-6 flex flex-col">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800">Storage Usage</h3>
                  <span className="text-sm font-bold text-slate-600">{systemStats.storageUsage.used} / {systemStats.storageUsage.total} {systemStats.storageUsage.unit}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 mb-2 overflow-hidden border border-slate-200">
                  <div className="bg-blue-600 h-3 rounded-full transition-all duration-1000" style={{ width: `${Math.min((systemStats.storageUsage.used / systemStats.storageUsage.total) * 100, 100)}%` }}></div>
                </div>
                <p className="text-xs text-slate-500 font-bold">Total bucket capacity based on direct API retrieval.</p>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex-1 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800">Daily API Requests</h3>
                </div>
                
                {/* Exam Generation Bar */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1">
                     <span className="text-xs font-bold text-slate-500">Generation</span>
                     <span className="text-xs font-bold text-slate-600">{systemStats.apiQuota.generation.used} / {systemStats.apiQuota.generation.total} {systemStats.apiQuota.generation.unit}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                    <div className="bg-purple-600 h-2 rounded-full transition-all duration-1000" style={{ width: `${Math.min((systemStats.apiQuota.generation.used / systemStats.apiQuota.generation.total) * 100, 100)}%` }}></div>
                  </div>
                </div>

                {/* Item Evaluation Bar */}
                <div className="mb-2">
                  <div className="flex justify-between items-center mb-1">
                     <span className="text-xs font-bold text-slate-500">Evaluation (RAGAS)</span>
                     <span className="text-xs font-bold text-slate-600">{systemStats.apiQuota.evaluation.used} / {systemStats.apiQuota.evaluation.total} {systemStats.apiQuota.evaluation.unit}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                    <div className="bg-rose-500 h-2 rounded-full transition-all duration-1000" style={{ width: `${Math.min((systemStats.apiQuota.evaluation.used / systemStats.apiQuota.evaluation.total) * 100, 100)}%` }}></div>
                  </div>
                </div>

                <p className="text-xs text-slate-400 font-bold mt-2">Resets daily at midnight PT.</p>
              </div>
            </div>
            
          </div>
        </div>
      )}
    </>
  );
}