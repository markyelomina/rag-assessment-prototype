import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface BlueprintGenerationPayload {
  blueprint_id: string;
  references?: string[];
  custom_settings?: string[];
}

export interface CustomBatchBlock {
  competency: string;
  bloom: string;
  count: number;
  custom_settings?: string[];
}

export interface CustomBatchGenerationPayload {
  subject: string;
  blocks: CustomBatchBlock[];
  references?: string[];
  custom_settings?: string[];
}

interface UseExamGenerationProps {
  onSuccess?: () => void;
  onError?: (errMessage: string) => void;
}

export function useExamGeneration({ onSuccess, onError }: UseExamGenerationProps = {}) {
  const [status, setStatus] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS' | 'FAILURE'>('IDLE');
  const [message, setMessage] = useState<string>('');
  
  const activeChannelRef = useRef<RealtimeChannel | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  // Clean up channel listener on component unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (activeChannelRef.current) {
        supabase.removeChannel(activeChannelRef.current);
      }
    };
  }, []);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  const triggerGeneration = useCallback(async (
    generationType: 'blueprint' | 'custom_batch',
    payload: BlueprintGenerationPayload | CustomBatchGenerationPayload,
    examSessionId: string
  ) => {
    try {
      setStatus('PROCESSING');
      setMessage('Sending requirements to AI workers...');

      if (activeChannelRef.current) {
        supabase.removeChannel(activeChannelRef.current);
        activeChannelRef.current = null;
      }

      const endpoint = generationType === 'blueprint' 
        ? `${API_BASE_URL}/api/v1/generate/blueprint` 
        : `${API_BASE_URL}/api/v1/generate/custom_batch`;

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
            
            // Relies entirely on your original "Pending" status
            if (newStatus === 'Pending') {
              setStatus('SUCCESS');
              setMessage('Generation complete! Exam is ready for validation.');
              supabase.removeChannel(channel);
              activeChannelRef.current = null;
              if (onSuccessRef.current) onSuccessRef.current();
            } else if (newStatus === 'Failed') {
              setStatus('FAILURE');
              setMessage('A critical error occurred during batch generation.');
              supabase.removeChannel(channel);
              activeChannelRef.current = null;
              if (onErrorRef.current) onErrorRef.current('Batch generation failed on backend.');
            }
          }
        )
        .subscribe();

      activeChannelRef.current = channel;

    } catch (error: any) {
      console.error("Generation dispatch error:", error);
      setStatus('FAILURE');
      setMessage('Could not communicate with the generation server.');
      if (onErrorRef.current) onErrorRef.current(error?.message || 'Network error');
    }
  }, [API_BASE_URL]);

  return { triggerGeneration, status, message };
}