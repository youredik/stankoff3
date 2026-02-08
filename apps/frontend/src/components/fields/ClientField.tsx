'use client';

import { useState } from 'react';
import { Phone, Mail, Send, MessageCircle, Building2, Pencil, UserPlus } from 'lucide-react';
import { LegacyCustomerPicker } from '@/components/legacy/LegacyCustomerPicker';
import { LegacyCounterpartyPicker } from '@/components/legacy/LegacyCounterpartyPicker';
import type { ClientFieldValue, ClientFieldConfig } from '@/types';
import type { LegacyCustomer } from '@/types/legacy';
import type { LegacyCounterparty } from '@/types/legacy';
import type { FieldRenderer } from './types';

function ClientRenderer({ field, value, canEdit, onUpdate }: Parameters<FieldRenderer['Renderer']>[0]) {
  const [isEditing, setIsEditing] = useState(false);
  const client = value as ClientFieldValue | null;
  const config = field.config as ClientFieldConfig | undefined;

  if (!client || (!client.name && !client.phone && !client.email)) {
    if (canEdit) {
      return (
        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"
        >
          <UserPlus className="w-4 h-4" />
          Добавить клиента...
        </button>
      );
    }
    return <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>;
  }

  if (isEditing && canEdit) {
    return (
      <ClientInlineEditor
        value={client}
        config={config}
        onSave={(v) => { onUpdate(v); setIsEditing(false); }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        {client.name && (
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {client.name}
          </span>
        )}
        {canEdit && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-0.5 text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {client.phone && (
          <a
            href={`tel:${client.phone}`}
            className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
          >
            <Phone className="w-3 h-3" />
            {client.phone}
          </a>
        )}
        {client.email && (
          <a
            href={`mailto:${client.email}`}
            className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
          >
            <Mail className="w-3 h-3" />
            {client.email}
          </a>
        )}
        {client.telegram && (
          <a
            href={`https://t.me/${client.telegram.replace('@', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
          >
            <Send className="w-3 h-3" />
            {client.telegram}
          </a>
        )}
        {client.whatsapp && (
          <a
            href={`https://wa.me/${client.whatsapp.replace(/[^0-9]/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
          >
            <MessageCircle className="w-3 h-3" />
            WhatsApp
          </a>
        )}
        {client.counterpartyName && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Building2 className="w-3 h-3" />
            {client.counterpartyName}
          </span>
        )}
      </div>
    </div>
  );
}

// Inline editor для Renderer mode
function ClientInlineEditor({
  value,
  config,
  onSave,
  onCancel,
}: {
  value: ClientFieldValue;
  config?: ClientFieldConfig;
  onSave: (v: ClientFieldValue) => void;
  onCancel: () => void;
}) {
  const [client, setClient] = useState<ClientFieldValue>({ ...value });

  const update = (key: keyof ClientFieldValue, val: any) => {
    setClient((prev) => ({ ...prev, [key]: val || undefined }));
  };

  const inputClass =
    'w-full border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <div className="space-y-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <input
        type="text"
        value={client.name || ''}
        onChange={(e) => update('name', e.target.value)}
        placeholder="ФИО"
        className={inputClass}
        autoFocus
      />
      <input
        type="tel"
        value={client.phone || ''}
        onChange={(e) => update('phone', e.target.value)}
        placeholder="Телефон"
        className={inputClass}
      />
      <input
        type="email"
        value={client.email || ''}
        onChange={(e) => update('email', e.target.value)}
        placeholder="Email"
        className={inputClass}
      />
      <input
        type="text"
        value={client.telegram || ''}
        onChange={(e) => update('telegram', e.target.value)}
        placeholder="Telegram (@username)"
        className={inputClass}
      />
      <input
        type="tel"
        value={client.whatsapp || ''}
        onChange={(e) => update('whatsapp', e.target.value)}
        placeholder="WhatsApp (номер)"
        className={inputClass}
      />
      {config?.showCounterparty && (
        <LegacyCounterpartyPicker
          value={client.counterpartyId ?? null}
          onChange={(cp: LegacyCounterparty | null) => {
            update('counterpartyId', cp?.id);
            update('counterpartyName', cp?.name);
          }}
          placeholder="Контрагент (компания)"
        />
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
        >
          Отмена
        </button>
        <button
          onClick={() => onSave(client)}
          className="px-2.5 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700"
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}

function ClientForm({ field, value, onChange }: Parameters<FieldRenderer['Form']>[0]) {
  const client = (value as ClientFieldValue) || {};
  const config = field.config as ClientFieldConfig | undefined;

  const update = (key: keyof ClientFieldValue, val: any) => {
    onChange({ ...client, [key]: val || undefined });
  };

  const inputClass =
    'w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <div className="space-y-2">
      {/* Автозаполнение из Legacy CRM */}
      {config?.showLegacyPicker && (
        <div className="pb-2 border-b border-gray-200 dark:border-gray-700">
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
            Заполнить из Legacy CRM
          </label>
          <LegacyCustomerPicker
            value={client.legacyCustomerId ?? null}
            onChange={(customer: LegacyCustomer | null) => {
              if (customer) {
                onChange({
                  ...client,
                  name: customer.displayName || client.name,
                  phone: customer.phone || client.phone,
                  email: customer.email || client.email,
                  legacyCustomerId: customer.id,
                });
              }
            }}
            placeholder="Найти клиента в Legacy..."
          />
        </div>
      )}

      <input
        type="text"
        value={client.name || ''}
        onChange={(e) => update('name', e.target.value)}
        placeholder="ФИО"
        className={inputClass}
      />
      <input
        type="tel"
        value={client.phone || ''}
        onChange={(e) => update('phone', e.target.value)}
        placeholder="Телефон"
        className={inputClass}
      />
      <input
        type="email"
        value={client.email || ''}
        onChange={(e) => update('email', e.target.value)}
        placeholder="Email"
        className={inputClass}
      />
      <input
        type="text"
        value={client.telegram || ''}
        onChange={(e) => update('telegram', e.target.value)}
        placeholder="Telegram (@username)"
        className={inputClass}
      />
      <input
        type="tel"
        value={client.whatsapp || ''}
        onChange={(e) => update('whatsapp', e.target.value)}
        placeholder="WhatsApp (номер)"
        className={inputClass}
      />

      {config?.showCounterparty && (
        <LegacyCounterpartyPicker
          value={client.counterpartyId ?? null}
          onChange={(cp: LegacyCounterparty | null) => {
            update('counterpartyId', cp?.id);
            update('counterpartyName', cp?.name);
          }}
          placeholder="Контрагент (компания)"
        />
      )}
    </div>
  );
}

function ClientFilter({ field, filterValue, onChange, inputClass }: Parameters<NonNullable<FieldRenderer['Filter']>>[0]) {
  return (
    <div className="mt-2">
      <input
        type="text"
        value={filterValue || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Поиск по "${field.name}"...`}
        className={inputClass}
      />
    </div>
  );
}

export const clientFieldRenderer: FieldRenderer = {
  Renderer: ClientRenderer,
  Form: ClientForm,
  Filter: ClientFilter,
};
