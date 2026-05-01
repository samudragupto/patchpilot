import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PatchPilot — Incident-to-PR AI Copilot',
  description: 'AI-powered incident investigation with graph-based reasoning and full transparency. Turn production bugs into reviewer-ready PRs in minutes.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#08080c] text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
