'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '../../components/Navbar';
import { UserCard } from '../../components/UserCard';
import { useAuth } from '../../hooks/useAuth';
import { getRecentUploads, UploadRecord } from '../../lib/db';

export default function DashboardPage() {
  const { user, isAuthenticated } = useAuth();
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const data = await getRecentUploads(user?.id);
        setUploads(data);
      } catch (err) {
        console.error('Failed to load uploads:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user?.id]);

  return (
    <div className="dashboard-container space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">User Dashboard</h1>
        <Link
          href="/upload"
          className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition"
        >
          New Upload
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <UserCard />
        </div>

        <div className="md:col-span-2 bg-white p-6 border rounded-lg shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Recent Uploads</h2>

          {loading ? (
            <p className="text-slate-500">Loading uploads...</p>
          ) : uploads.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 mb-4">No uploads found.</p>
              <Link
                href="/upload"
                className="text-blue-600 hover:underline font-medium"
              >
                Upload your first file &rarr;
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500 font-semibold">
                    <th className="pb-3">Filename</th>
                    <th className="pb-3">Size</th>
                    <th className="pb-3">Created</th>
                    <th className="pb-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-slate-700">
                  {uploads.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-3 font-medium">{item.filename}</td>
                      <td className="py-3">{(item.size / 1024).toFixed(1)} KB</td>
                      <td className="py-3">{new Date(item.createdAt).toLocaleDateString()}</td>
                      <td className="py-3">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
