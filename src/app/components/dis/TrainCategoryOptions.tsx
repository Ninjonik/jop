'use client';
import { trainCategoryGroups } from '@/lib/dis/train-categories';
import { useTranslation } from '@/lib/i18n/client';

export function TrainCategoryOptions() {
  const t = useTranslation();
  return trainCategoryGroups.map((group) => (
    <optgroup key={group.label} label={t(group.label)}>
      {group.categories.map(([code, name]) => (
        <option key={code} value={code}>
          {code} — {t(name)}
        </option>
      ))}
    </optgroup>
  ));
}
