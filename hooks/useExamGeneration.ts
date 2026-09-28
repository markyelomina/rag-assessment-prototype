import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useExamGeneration() {
  const [status, setStatus] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS' | 'FAILURE'>('IDLE');
  const [message, setMessage] = useState<string>('');

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  const triggerGeneration = useCallback(async (
    generationType: 'blueprint' | 'custom_batch',
    payload: any,
    examSessionId: string
  ) => {
    try {
      setStatus('PROCESSING');
      setMessage('Sending requirements to AI workers...');

      const endpoint = generationType === 'blueprint' 
        ? `${API_BASE_URL}/api/v1/generate/blueprint` 
        : `${API_BASE_URL}/api/v1/generate/custom_batch`;

      // Directly pass the exact shape including exam_session_id without renaming keys
      const requestBody = {
        ...payload,
        exam_session_id: examSessionId
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Failed to dispatch generation task to backend.');
      }

      setMessage('Generation in progress. You can safely close this window or wait for completion.');

      const channel = supabase
        .channel(`exam-status-${examSessionId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'Exams',
            filter: `exam_id=eq.${examSessionId}`
          },
          (payload) => {
            const newStatus = payload.new.global_status;
            
            if (newStatus === 'Pending') {
              setStatus('SUCCESS');
              setMessage('Generation complete! Exam is ready for validation.');
              supabase.removeChannel(channel);
            } else if (newStatus === 'Failed') {
              setStatus('FAILURE');
              setMessage('A critical error occurred during batch generation.');
              supabase.removeChannel(channel);
            }
          }
        )
        .subscribe();

    } catch (error) {
      console.error("Generation dispatch error:", error);
      setStatus('FAILURE');
      setMessage('Could not communicate with the generation server.');
    }
  }, [API_BASE_URL]);

  return { triggerGeneration, status, message };
}