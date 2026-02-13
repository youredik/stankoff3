'use client';

import SearchableSelect from './SearchableSelect';

export interface SearchableUserOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

interface SearchableUserSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  users: SearchableUserOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

const getSearchText = (u: SearchableUserOption) =>
  `${u.firstName} ${u.lastName} ${u.email || ''}`;

const renderOption = (u: SearchableUserOption) => (
  <span>{u.firstName} {u.lastName}</span>
);

const renderSelected = (u: SearchableUserOption) => (
  <span className="truncate">{u.firstName} {u.lastName}</span>
);

export default function SearchableUserSelect({
  value,
  onChange,
  users,
  placeholder = 'Не назначен',
  emptyLabel = 'Не назначен',
  disabled = false,
  compact = false,
  className = '',
}: SearchableUserSelectProps) {
  return (
    <SearchableSelect
      options={users}
      value={value}
      onChange={(v) => onChange(v as string | null)}
      getSearchText={getSearchText}
      renderOption={renderOption}
      renderSelectedSingle={renderSelected}
      emptyLabel={emptyLabel}
      placeholder={placeholder}
      disabled={disabled}
      compact={compact}
      className={className}
    />
  );
}
