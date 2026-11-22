import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function LoadingSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-3/4 rounded-lg" />
          <Skeleton className="h-4 w-1/2 rounded-lg" />
        </div>
      ))}
    </div>
  );
}