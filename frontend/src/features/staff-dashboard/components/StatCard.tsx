import type { ComponentType } from 'react';
import { Card } from '@/shared/ui';

export function StatCard({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: ComponentType<{ className?: string }> }) {
  return (
    <Card padding="md" aria-label={label} role="group">
      <div className="flex items-center justify-between gap-2 text-gray-600">
        <p className="text-body">{label}</p>
        <span className="grid size-9 place-items-center rounded-full bg-primary-50 text-primary-700">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 font-heading text-h2 text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-caption text-gray-500">{hint}</p>}
    </Card>
  );
}
