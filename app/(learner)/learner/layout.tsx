'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';

export default function LearnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isTakingExam = pathname.includes('/take');

  return (
    <DashboardLayout role="learner" hideSidebar={isTakingExam}>
      {children}
    </DashboardLayout>
  );
}