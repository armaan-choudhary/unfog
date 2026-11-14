'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../components/Navbar';
import { UploadBtn } from '../../components/UploadBtn';
import { useAuth } from '../../hooks/useAuth';

export default function UploadPage() {
  const { user } = useAuth();
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const handleUploadSuccess = (url: string) => {
    setUploadedUrl(url);
  };

  return (
    <div className="upload-page-container max-w-2xl mx-auto space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-3xl font-bold text-slate-900">File Upload</h1>
        <p className="text-slate-600 mt-1">
          Upload assets directly to cloud storage via S3.
        </p>
      </div>

      <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-4 border-b">
          <span className="text-sm text-slate-600">Uploading as:</span>
          <span className="text-sm font-semibold text-slate-900">
            {user ? `${user.name} (${user.email})` : 'Anonymous / Default User'}
          </span>
        </div>

        <UploadBtn
          onSuccess={handleUploadSuccess}
          allowedExtensions={['.png', '.jpg', '.jpeg', '.pdf', '.txt', '.zip']}
          maxSizeBytes={10 * 1024 * 1024}
        />

        {uploadedUrl && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 space-y-2">
            <p className="font-semibold">File uploaded to S3 successfully!</p>
            <p className="break-all font-mono text-xs text-green-900">{uploadedUrl}</p>
            <div className="pt-2">
              <Link
                href="/dashboard"
                className="text-green-700 underline font-medium hover:text-green-900"
              >
                &larr; Return to Dashboard to view all uploads
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
