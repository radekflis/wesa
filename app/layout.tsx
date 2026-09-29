import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WESA ALAW — Adaptive Layered AI Workflowstation',
  description: 'Operating system for knowledge work',
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="pl"><body>{children}</body></html>;
}
