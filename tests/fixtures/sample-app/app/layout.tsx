import React from 'react';
import { Navbar } from '../components/Navbar';

export const metadata = {
  title: 'Unfog Sample App',
  description: 'Next.js fixture application for Unfog dependency graph analysis and testing',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
