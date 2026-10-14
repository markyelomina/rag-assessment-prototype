import { useState, useEffect, useCallback, useRef } from 'react';

interface IngestionDetails {
  step?: string;
  details?: string;
  message?: string;
}

interface UseIngestionProps {
  onSuccess?: () => void;
}

export function useIngestion({ onSuccess }: UseIngestionProps = {}) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILURE'>('IDLE');
  const [progressDetails, setProgressDetails] = useState<IngestionDetails | null>(null);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const startIngestion = useCallback(async (requestId: string, storagePath: string, tags: string[] = []) => {
    try {
      setStatus('PENDING');
      setProgressDetails({ message: 'Sending vectorization payload to backend...' });
      
      const response = await fetch(`${API_BASE_URL}/api/v1/vectorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          request_id: requestId, 
          storage_path: storagePath, 
          tags: tags 
        }),
      });

      const data = await response.json();
      if (data.task_id) {
        setTaskId(data.task_id);
      }
    } catch (error) {
      setStatus('FAILURE');
      setProgressDetails({ message: 'Failed to connect to backend.' });
      console.error(error);
    }
  }, [API_BASE_URL]);

  const resetIngestion = useCallback(() => {
    setTaskId(null);
    setStatus('IDLE');
    setProgressDetails(null);
  }, []);

  useEffect(() => {
    if (!taskId) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/task/${taskId}`);
        const data = await response.json();

        if (data.status === 'PENDING') {
          setStatus('PENDING');
          setProgressDetails({ message: 'Waiting for hardware resources in Celery queue...' });
        } 
        else if (data.status === 'PROCESSING') {
          setStatus('PROCESSING');
          setProgressDetails(data.details);
        } 
        else if (data.status === 'SUCCESS') {
          // Check if the task returned a failure payload
          if (data.final_result?.status === 'FAILURE' || data.final_result?.status === 'Error') {
            setStatus('FAILURE');
            setProgressDetails({ message: data.final_result?.message || 'Processing failed.' });
            clearInterval(interval);
            setTaskId(null);
            return;
          }

          setStatus('SUCCESS');
          setProgressDetails({ message: 'File successfully vectorized and indexed.' });
          clearInterval(interval);
          setTaskId(null);
          
          if (onSuccessRef.current) onSuccessRef.current();
        } 
        else if (data.status === 'FAILURE') {
          setStatus('FAILURE');
          setProgressDetails({ message: data.details || 'The pipeline failed during vectorization.' });
          clearInterval(interval);
          setTaskId(null);
        }
      } catch (error) {
        console.error("Polling interval error:", error);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [taskId, API_BASE_URL]);

  return { startIngestion, resetIngestion, status, progressDetails };
}