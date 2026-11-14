'use client';

import React, { useRef } from 'react';
import { useUpload } from '../hooks/useUpload';

export interface UploadBtnProps {
  onSuccess?: (url: string) => void;
  allowedExtensions?: string[];
  maxSizeBytes?: number;
}

export function UploadBtn({ onSuccess, allowedExtensions, maxSizeBytes }: UploadBtnProps) {
  const { isUploading, uploadProgress, uploadFile, error, lastUpload } = useUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (maxSizeBytes && file.size > maxSizeBytes) {
      alert(`File size exceeds limit of ${maxSizeBytes} bytes`);
      return;
    }

    const res = await uploadFile(file);
    if (res.success && res.record) {
      onSuccess?.(res.record.url);
    }
  };

  return (
    <div className="upload-btn-container p-4 border rounded shadow-sm bg-white">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        style={{ display: 'none' }}
        onChange={handleChange}
        accept={allowedExtensions?.join(',')}
      />

      <button
        onClick={handleClick}
        disabled={isUploading}
        className="px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isUploading ? `Uploading (${uploadProgress}%)` : 'Select & Upload File'}
      </button>

      {isUploading && (
        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {error && (
        <p className="text-red-500 text-sm mt-2">
          Error: {error}
        </p>
      )}

      {lastUpload && !isUploading && (
        <p className="text-green-600 text-sm mt-2">
          Uploaded successfully: {lastUpload.filename}
        </p>
      )}
    </div>
  );
}

export default UploadBtn;
