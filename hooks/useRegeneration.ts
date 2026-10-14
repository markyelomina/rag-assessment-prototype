import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface RegenerationDetails {
  step?: string;
  details?: string;
  message?: string;
}

export function useRegeneration() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS' | 'FAILURE'>('IDLE');
  const [progressDetails, setProgressDetails] = useState<RegenerationDetails | null>(null);

  const API_BASE_URL = 
    process.env.NEXT_PUBLIC_API_URL || 
    process.env.NEXT_PUBLIC_API_BASE_URL || 
    'http://localhost:8000';

// Worker Heartbeat Check (Queries Supabase Worker_Health matching Admin Telemetry)
  const checkRegenerationHeartbeat = useCallback(async (): Promise<boolean> => {
    try {
      // 1. Primary check: Query telemetry route if available
      try {
        const telRes = await fetch('/api/telemetry');
        if (telRes.ok) {
          const telData = await telRes.json();
          const workerStatus = telData.backendHealth?.aiWorker?.toLowerCase();
          if (workerStatus === 'operational') {
            return true;
          }
        }
      } catch {
        // Fall through to direct Supabase query
      }

      // 2. Query Worker_Health table directly from Supabase
      const { data, error } = await supabase
        .from('Worker_Health')
        .select('*')
        .eq('worker_name', 'ai_celery_worker')
        .order('last_heartbeat', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        console.warn('[Heartbeat] No Worker_Health record found in Supabase:', error);
        return false;
      }

      // Check operational status
      const isStatusOk = data.status?.toLowerCase() === 'operational';
      if (!isStatusOk) {
        console.warn(`[Heartbeat] Worker status is "${data.status}", expected "operational"`);
        return false;
      }

      // 5-minute safety threshold matching CreateExamPage & Admin Overview
      const lastBeatTime = new Date(data.last_heartbeat).getTime();
      const diffMinutes = (Date.now() - lastBeatTime) / (1000 * 60);

      return diffMinutes <= 5;
    } catch (err) {
      console.error('[Heartbeat] Supabase health check exception:', err);
      return false;
    }
  }, []);

  // Trigger the FastAPI Regeneration Endpoint
  const regenerateItem = useCallback(async (oldItemId: string, examSessionId: string) => {
    try {
      setStatus('PROCESSING');
      setProgressDetails({ message: 'Archiving old item and initializing regeneration...' });

      const response = await fetch(`${API_BASE_URL}/api/v1/generate/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          old_item_id: oldItemId, 
          exam_session_id: examSessionId 
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();
      if (data.task_id) {
        setTaskId(data.task_id);
      } else {
        throw new Error('No task ID returned by backend.');
      }
    } catch (error: any) {
      setStatus('FAILURE');
      setProgressDetails({ message: error.message || 'Failed to connect to the regeneration server.' });
      console.error(error);
    }
  }, [API_BASE_URL]);

  // Poll Task Status via Celery
  useEffect(() => {
    if (!taskId) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/task/${taskId}`);
        const data = await response.json();

        if (data.status === 'PROCESSING') {
          setProgressDetails(data.details); 
        } else if (data.status === 'SUCCESS') {
          setStatus('SUCCESS');
          setProgressDetails({ message: 'Question regenerated and replaced.' });
          clearInterval(interval);
          setTaskId(null);
        } else if (data.status === 'FAILURE') {
          setStatus('FAILURE');
          setProgressDetails({ message: typeof data.details === 'string' ? data.details : 'The regeneration task failed.' });
          clearInterval(interval);
          setTaskId(null);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [taskId, API_BASE_URL]);

  return { regenerateItem, checkRegenerationHeartbeat, status, progressDetails };
}