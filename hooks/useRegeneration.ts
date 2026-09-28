import { useState, useEffect, useCallback } from 'react';

interface RegenerationDetails {
  step?: string;
  details?: string;
  message?: string;
}

export function useRegeneration() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS' | 'FAILURE'>('IDLE');
  const [progressDetails, setProgressDetails] = useState<RegenerationDetails | null>(null);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  // 1. Trigger the FastAPI Regeneration Endpoint
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

      const data = await response.json();
      if (data.task_id) {
        setTaskId(data.task_id); // Triggers the polling effect
      }
    } catch (error) {
      setStatus('FAILURE');
      setProgressDetails({ message: 'Failed to connect to the regeneration server.' });
      console.error(error);
    }
  }, [API_BASE_URL]);

  // 2. Poll the Task Status via Celery
  useEffect(() => {
    if (!taskId) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/task/${taskId}`);
        const data = await response.json();

        if (data.status === 'PROCESSING') {
          setProgressDetails(data.details); 
        } 
        else if (data.status === 'SUCCESS') {
          setStatus('SUCCESS');
          setProgressDetails({ message: 'New question successfully generated and appended to the exam.' });
          clearInterval(interval);
          setTaskId(null);
        } 
        else if (data.status === 'FAILURE') {
          setStatus('FAILURE');
          setProgressDetails({ message: 'The regeneration task failed.' });
          clearInterval(interval);
          setTaskId(null);
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [taskId, API_BASE_URL]);

  return { regenerateItem, status, progressDetails };
}