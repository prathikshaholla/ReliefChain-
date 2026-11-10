// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReliefChain | Disaster Relief Management Portal',
  description:
    'DBMS Level 3 project: PostgreSQL (relational + pgvector) and MongoDB system for disaster resource allocation, SOS triage and fleet logistics.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
