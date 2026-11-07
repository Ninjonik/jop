import { trainCategoryGroups } from '@/lib/dis/train-categories';

export function TrainCategoryOptions() {
  return trainCategoryGroups.map((group) => (
    <optgroup key={group.label} label={group.label}>
      {group.categories.map(([code, name]) => (
        <option key={code} value={code}>
          {code} — {name}
        </option>
      ))}
    </optgroup>
  ));
}
