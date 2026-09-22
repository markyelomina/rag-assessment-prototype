'use client';

import React, { useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import { usePagination } from '@/hooks/usePagination';

export default function AdminLogsPage() {
  const [logSearch, setLogSearch] = useState('');
  const [logDateFilter, setLogDateFilter] = useState('All Time');
  const [logTypeFilter, setLogTypeFilter] = useState('All Events');
  
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const auditLogs = [
    { id: 'LOG 8825', user: 'system rag', role: 'AI Engine', action: 'Vectorized newly uploaded document: Chapter_1.pdf', timestamp: '2026 07 11 02:15 PM', type: 'AI Engine', severity: 'Info', ip: 'Internal', browser: 'System Service' },
    { id: 'LOG 8824', user: 'admin.mark@system.com', role: 'Admin', action: 'Created new custom role: Assistant Admin', timestamp: '2026 07 11 11:05 AM', type: 'Security', severity: 'Warning', ip: '192.168.1.104', browser: 'Chrome on MacOS' },
    { id: 'LOG 8823', user: 'student.reyes@stud.edu', role: 'Learner', action: 'Started Mock Exam: Personality Theories Final', timestamp: '2026 07 10 01:20 PM', type: 'User Activity', severity: 'Info', ip: '192.168.1.205', browser: 'Safari on iOS' },
    { id: 'LOG 8822', user: 'unknown ip', role: 'System', action: 'Failed login attempt (5x) for admin account', timestamp: '2026 07 10 11:05 AM', type: 'Security', severity: 'Critical', ip: '45.22.19.10', browser: 'Unknown Script' },
    { id: 'LOG 8821', user: 'prof.marquez@univ.edu', role: 'Teacher', action: 'Uploaded document: Industrial_Psychology_Reviewer.pdf', timestamp: '2026 07 10 10:14 AM', type: 'Document Uploads', severity: 'Info', ip: '192.168.1.110', browser: 'Edge on Windows' },
    { id: 'LOG 8820', user: 'system rag', role: 'AI Engine', action: 'Generated 50 mock questions for Cohort Alpha', timestamp: '2026 07 10 09:30 AM', type: 'AI Engine', severity: 'Info', ip: 'Internal', browser: 'System Service' },
    { id: 'LOG 8819', user: 'student.santos@stud.edu', role: 'Learner', action: 'Completed Mock Exam: Abnormal Psychology Simulation', timestamp: '2026 07 10 08:45 AM', type: 'User Activity', severity: 'Info', ip: '192.168.1.201', browser: 'Chrome on Windows' },
    { id: 'LOG 8818', user: 'admin.mark@system.com', role: 'Admin', action: 'Updated security access permissions for Teacher role', timestamp: '2026 07 09 04:15 PM', type: 'Security', severity: 'Warning', ip: '192.168.1.104', browser: 'Chrome on MacOS' },
  ];

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = log.user.toLowerCase().includes(logSearch.toLowerCase()) || log.id.toLowerCase().includes(logSearch.toLowerCase());
    const matchesType = logTypeFilter === 'All Events' || log.type === logTypeFilter;
    return matchesSearch && matchesType;
  });

  const {
    currentPage,
    totalPages,
    currentItems: currentLogs,
    indexOfFirstItem: indexOfFirstLog,
    indexOfLastItem: indexOfLastLog,
    totalItems,
    nextPage,
    prevPage,
    resetPage
  } = usePagination(filteredLogs, 6);

  const handleDateFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLogDateFilter(e.target.value);
    resetPage();
  };

  return (
    <div className="space-y-6 relative">
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">System Audit Logs and Activity Tracker</h1>
          <p className="text-sm text-slate-500 mt-1 font-bold">Monitor all system events and user actions across the platform.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-slate-700">Event History</h3>
            <button className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-bold rounded hover:bg-white transition-colors shadow-sm flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Export Logs
            </button>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <input 
                type="text" 
                placeholder="Search by User Email or Event ID..." 
                value={logSearch}
                onChange={(e) => { setLogSearch(e.target.value); resetPage(); }}
                className="w-full text-xs font-bold px-3 py-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none" 
              />
            </div>
            
            <div className="flex gap-2 flex-col sm:flex-row">
              <select 
                value={logDateFilter}
                onChange={handleDateFilterChange}
                className="text-xs font-bold px-3 py-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white text-slate-700 w-full sm:w-auto"
              >
                <option value="All Time">All Time</option>
                <option value="Last 24 Hours">Last 24 Hours</option>
                <option value="Last 7 Days">Last 7 Days</option>
                <option value="Last 30 Days">Last 30 Days</option>
                <option value="Custom Range">Custom Range</option>
              </select>
              
              {logDateFilter === 'Custom Range' && (
                <div className="flex items-center gap-2 animate-in fade-in duration-200">
                  <input 
                    type="date" 
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="text-xs font-bold px-3 py-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white text-slate-700" 
                  />
                  <span className="text-slate-400 font-bold text-xs">to</span>
                  <input 
                    type="date" 
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="text-xs font-bold px-3 py-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white text-slate-700" 
                  />
                </div>
              )}
            </div>

            <select 
              value={logTypeFilter}
              onChange={(e) => { setLogTypeFilter(e.target.value); resetPage(); }}
              className="text-xs font-bold px-3 py-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white text-slate-700"
            >
              <option value="All Events">All Event Types</option>
              <option value="Security">Security Events</option>
              <option value="Document Uploads">Document Uploads</option>
              <option value="AI Engine">AI Engine</option>
              <option value="User Activity">User Activity</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-slate-200">
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Event ID</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Severity</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">User Account</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Role</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Action Performed</th>
                <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs md:text-sm text-slate-700">
              {currentLogs.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState 
                      title="No logs found" 
                      message="No audit logs match your current search and filter criteria. Try adjusting your date range or event type." 
                    />
                  </td>
                </tr>
              ) : (
                currentLogs.map((log) => (
                  <tr 
                    key={log.id} 
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <td className="p-4 font-mono font-bold text-blue-600 group-hover:underline">{log.id}</td>
                    <td className="p-4">
                      <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        log.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                        log.severity === 'Warning' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {log.severity}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-800">{log.user}</td>
                    <td className="p-4">
                      <span className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        log.role === 'Admin' ? 'bg-purple-50 text-purple-700' :
                        log.role === 'Teacher' ? 'bg-emerald-50 text-emerald-700' :
                        log.role === 'AI Engine' ? 'bg-indigo-50 text-indigo-700' :
                        log.role === 'System' ? 'bg-rose-50 text-rose-700' :
                        'bg-blue-50 text-blue-700'
                      }`}>
                        {log.role}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-600">{log.action}</td>
                    <td className="p-4 font-bold text-slate-500 whitespace-nowrap">{log.timestamp}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-between items-center text-sm font-bold text-slate-500">
          <span>Showing {filteredLogs.length > 0 ? indexOfFirstLog + 1 : 0} to {Math.min(indexOfLastLog, filteredLogs.length)} of {totalItems} events</span>
          <div className="flex gap-2">
            <button 
              onClick={prevPage}
              disabled={currentPage === 1}
              className={`px-3 py-1.5 border rounded font-bold shadow-sm ${currentPage === 1 ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              Previous
            </button>
            <button 
              onClick={nextPage}
              disabled={currentPage === totalPages || totalPages === 0}
              className={`px-3 py-1.5 border rounded font-bold shadow-sm ${currentPage === totalPages || totalPages === 0 ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Event Detail Record</h3>
                <p className="text-xs text-slate-500 mt-1 font-mono font-bold">{selectedLog.id}</p>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-700 transition-colors bg-slate-100 hover:bg-slate-200 rounded p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded border border-slate-100">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Timestamp</span>
                  <span className="block text-sm font-bold text-slate-800">{selectedLog.timestamp}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded border border-slate-100">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Severity Status</span>
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        selectedLog.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                        selectedLog.severity === 'Warning' ? 'bg-amber-100 text-amber-800' :
                        'bg-slate-200 text-slate-600'
                      }`}>
                    {selectedLog.severity}
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded border border-slate-100">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Action Performed</span>
                <span className="block text-sm font-bold text-slate-800">{selectedLog.action}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded border border-slate-100">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Source IP Address</span>
                  <span className="block text-sm font-mono font-bold text-slate-800">{selectedLog.ip}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded border border-slate-100">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Client User Agent</span>
                  <span className="block text-sm font-bold text-slate-800">{selectedLog.browser}</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setSelectedLog(null)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                >
                  Close Record
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}