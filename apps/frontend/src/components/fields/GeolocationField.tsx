'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Search, Loader2, X } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import type { GeolocationValue } from '@/types';
import type { FieldRenderer } from './types';

interface GeocodingResult {
  address: string;
  lat: number;
  lng: number;
  displayAddress: string;
}

// Мини-карта Yandex Maps (static API — не требует JS API)
function StaticMap({ lat, lng }: { lat: number; lng: number }) {
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
  if (!apiKey) return null;

  const src = `https://static-maps.yandex.ru/v1?ll=${lng},${lat}&z=15&size=400,200&l=map&pt=${lng},${lat},pm2rdm&apikey=${apiKey}`;

  return (
    <img
      src={src}
      alt="Карта"
      className="w-full h-32 object-cover rounded-lg mt-1.5 border border-gray-200 dark:border-gray-700"
      loading="lazy"
    />
  );
}

function GeolocationRenderer({ field, value, canEdit, onUpdate }: Parameters<FieldRenderer['Renderer']>[0]) {
  const [isEditing, setIsEditing] = useState(false);
  const geo = value as GeolocationValue | null;

  if (!geo?.address) {
    if (canEdit) {
      return (
        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"
        >
          <MapPin className="w-4 h-4" />
          Указать адрес...
        </button>
      );
    }
    return <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>;
  }

  if (isEditing && canEdit) {
    return (
      <AddressSearch
        initialValue={geo.address}
        onSelect={(result) => {
          onUpdate({ address: result.displayAddress, lat: result.lat, lng: result.lng });
          setIsEditing(false);
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div>
      <div className="flex items-start gap-2">
        <MapPin className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-700 dark:text-gray-300">{geo.address}</span>
          {geo.lat && geo.lng && (
            <a
              href={`https://yandex.ru/maps/?pt=${geo.lng},${geo.lat}&z=16&l=map`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-primary-600 dark:text-primary-400 hover:underline mt-0.5"
            >
              Открыть на карте
            </a>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-0.5 text-gray-400 hover:text-primary-600"
          >
            <MapPin className="w-3 h-3" />
          </button>
        )}
      </div>
      {geo.lat && geo.lng && <StaticMap lat={geo.lat} lng={geo.lng} />}
    </div>
  );
}

// Поиск адреса через backend API
function AddressSearch({
  initialValue,
  onSelect,
  onCancel,
}: {
  initialValue?: string;
  onSelect: (result: GeocodingResult) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState(initialValue || '');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 3) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.get<GeocodingResult[]>(`/geocoding/search?q=${encodeURIComponent(q)}`);
      setResults(res.data);
      setShowResults(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (val: string) => {
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 400);
  };

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700">
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Введите адрес..."
          className="flex-1 text-sm bg-transparent focus:outline-none dark:text-gray-200"
          autoFocus
        />
        {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        <button onClick={onCancel} className="p-0.5 text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                onSelect(r);
                setShowResults(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-start gap-2"
            >
              <MapPin className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-gray-700 dark:text-gray-300">{r.displayAddress}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GeolocationForm({ value, onChange }: Parameters<FieldRenderer['Form']>[0]) {
  const geo = (value as GeolocationValue) || {};

  return (
    <div>
      <AddressSearch
        initialValue={geo.address || ''}
        onSelect={(result) => {
          onChange({ address: result.displayAddress, lat: result.lat, lng: result.lng });
        }}
        onCancel={() => {}}
      />
      {geo.address && (
        <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <MapPin className="w-4 h-4 text-red-500" />
          <span>{geo.address}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-auto text-xs text-red-500 hover:underline"
          >
            Очистить
          </button>
        </div>
      )}
    </div>
  );
}

export const geolocationFieldRenderer: FieldRenderer = {
  Renderer: GeolocationRenderer,
  Form: GeolocationForm,
};
