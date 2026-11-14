'use client';

import { useState } from 'react';
import { store, useStore } from '../lib/store';
import { handleUpload, UploadApiResponse } from '../app/api/upload/route';
import { UploadRecord } from '../lib/db';

export interface UseUploadReturn {
  isUploading: boolean;
  uploadProgress: number;
  lastUpload: UploadRecord | null;
  error: string | null;
  uploadFile: (file: File) => Promise<UploadApiResponse>;
  reset: () => void;
}

/**
 * Custom React hook for file uploads
 * Wires the UI component to the upload route handler and state store
 */
export function useUpload(): UseUploadReturn {
  const isUploading = useStore((s) => s.isUploading);
  const uploadProgress = useStore((s) => s.uploadProgress);
  const currentUser = useStore((s) => s.currentUser);
  const error = useStore((s) => s.error);

  const [lastUpload, setLastUpload] = useState<UploadRecord | null>(null);

  const uploadFile = async (file: File): Promise<UploadApiResponse> => {
    store.setIsUploading(true);
    store.setUploadProgress(20);
    store.setError(null);

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      store.setUploadProgress(50);

      // Call API upload logic
      const response = await handleUpload({
        userId: currentUser?.id || 'usr_1',
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        data: buffer,
      });

      if (!response.success || !response.record) {
        throw new Error(response.error || 'Upload failed');
      }

      store.setUploadProgress(100);
      store.addUploadRecord(response.record);
      setLastUpload(response.record);
      return response;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error during upload';
      store.setError(message);
      return { success: false, error: message };
    } finally {
      store.setIsUploading(false);
    }
  };

  const reset = () => {
    store.reset();
    setLastUpload(null);
  };

  return {
    isUploading,
    uploadProgress,
    lastUpload,
    error,
    uploadFile,
    reset,
  };
}
