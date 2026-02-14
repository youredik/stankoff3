'use client';

import { useState, useEffect } from 'react';
import { UserCircle, Phone, Mail, Loader2, ExternalLink } from 'lucide-react';
import { entitiesApi, type TableResponse } from '@/lib/api/entities';
import { useEntityNavigation } from '@/hooks/useEntityNavigation';

interface CrmContactsProps {
  /** ID контрагента (entity UUID) */
  counterpartyEntityId: string;
  /** workspaceId контактов */
  contactsWorkspaceId: string;
}

export function CrmContacts({ counterpartyEntityId, contactsWorkspaceId }: CrmContactsProps) {
  const [contacts, setContacts] = useState<TableResponse['items']>([]);
  const [loading, setLoading] = useState(true);
  const { openEntity } = useEntityNavigation();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Ищем контакты по relation-полю counterparty.id
    entitiesApi
      .getTable(contactsWorkspaceId, {
        perPage: 50,
        customFilters: { counterpartyEntityId: counterpartyEntityId },
      })
      .then((res) => {
        if (!cancelled) setContacts(res.items);
      })
      .catch(() => {
        if (!cancelled) setContacts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [counterpartyEntityId, contactsWorkspaceId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Загрузка контактов...
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="py-3 text-sm text-gray-400">
        Нет связанных контактов
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        Контакты ({contacts.length})
      </div>
      {contacts.map((contact) => {
        const data = contact.data || {};
        return (
          <button
            key={contact.id}
            onClick={() => openEntity(contact.id)}
            className="w-full flex items-start gap-3 px-2 py-2 text-left rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
          >
            <UserCircle className="h-8 w-8 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-gray-800 dark:text-gray-200 truncate">
                  {contact.title}
                </span>
                <ExternalLink className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 flex-shrink-0" />
              </div>
              {data.position && (
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{data.position}</div>
              )}
              <div className="flex items-center gap-3 mt-0.5">
                {data.email && (
                  <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Mail className="h-3 w-3" />
                    {data.email}
                  </span>
                )}
                {data.phone && (
                  <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Phone className="h-3 w-3" />
                    {data.phone}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
