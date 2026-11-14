import React from 'react';
import Link from 'next/link';
import { Navbar } from '../components/Navbar';

export default function HomePage() {
  return (
    <div className="home-container space-y-8">
      <header className="py-12 text-center bg-white border rounded-xl shadow-sm px-6">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 mb-4">
          Welcome to the Unfog Sample App
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
          A realistic Next.js App Router codebase demonstrating dependency graph tracing,
          scoped pruning, and blast radius calculation.
        </p>

        <div className="flex justify-center space-x-4">
          <Link
            href="/upload"
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow hover:bg-blue-700 transition"
          >
            Go to Upload
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-slate-100 text-slate-700 font-semibold rounded-lg border hover:bg-slate-200 transition"
          >
            View Dashboard
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white border rounded-lg shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-2">Upload Pipeline</h3>
          <p className="text-sm text-slate-600">
            Traces from <code>UploadBtn</code> &rarr; <code>useUpload</code> &rarr;{' '}
            <code>api/upload</code> &rarr; <code>s3.ts</code>.
          </p>
        </div>

        <div className="p-6 bg-white border rounded-lg shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-2">State & Storage</h3>
          <p className="text-sm text-slate-600">
            Reactive store in <code>lib/store.ts</code> synchronized with authentication and S3 upload records.
          </p>
        </div>

        <div className="p-6 bg-white border rounded-lg shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-2">Database Services</h3>
          <p className="text-sm text-slate-600">
            Mock database access in <code>lib/db.ts</code> shared across route handlers and dashboard components.
          </p>
        </div>
      </section>
    </div>
  );
}
