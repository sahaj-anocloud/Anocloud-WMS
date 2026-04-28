'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ShipmentsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/shipments/new'); }, [router]);
  return null;
}
