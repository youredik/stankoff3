'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface AvatarCropModalProps {
  file: File;
  outputSize?: number;
  onCrop: (croppedFile: File) => void;
  onClose: () => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;

/**
 * Современный кроп-редактор аватарки.
 * - Круглая маска-превью
 * - Зум: слайдер + колёсико мыши + pinch-to-zoom
 * - Перетаскивание для позиционирования
 * - Выходной формат: WebP 400×400
 */
export function AvatarCropModal({ file, outputSize = 400, onCrop, onClose }: AvatarCropModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 });
  const [saving, setSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Viewport size (CSS pixels)
  const VIEWPORT = 280;

  // Загрузка изображения
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // После загрузки img — подгоняем начальный зум
  const handleImageLoad = useCallback(() => {
    if (!imgRef.current) return;
    const { naturalWidth, naturalHeight } = imgRef.current;
    setImageSize({ w: naturalWidth, h: naturalHeight });

    // Начальный зум — чтобы меньшая сторона заполнила viewport
    const scale = VIEWPORT / Math.min(naturalWidth, naturalHeight);
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale)));
    setPosition({ x: 0, y: 0 });
  }, []);

  // Ограничение позиции чтобы изображение не выходило за пределы
  const clampPosition = useCallback((pos: { x: number; y: number }, z: number) => {
    if (!imageSize.w || !imageSize.h) return pos;
    const scaledW = imageSize.w * z;
    const scaledH = imageSize.h * z;
    const maxX = Math.max(0, (scaledW - VIEWPORT) / 2);
    const maxY = Math.max(0, (scaledH - VIEWPORT) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, pos.x)),
      y: Math.max(-maxY, Math.min(maxY, pos.y)),
    };
  }, [imageSize]);

  // Mouse drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const newPos = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
    setPosition(clampPosition(newPos, zoom));
  }, [dragging, dragStart, zoom, clampPosition]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  // Touch drag + pinch-to-zoom
  const lastTouchRef = useRef<{ x: number; y: number; dist?: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      lastTouchRef.current = { x: t.clientX - position.x, y: t.clientY - position.y };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchRef.current = { x: 0, y: 0, dist: Math.hypot(dx, dy) };
    }
  }, [position]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && lastTouchRef.current && !lastTouchRef.current.dist) {
      const t = e.touches[0];
      const newPos = { x: t.clientX - lastTouchRef.current.x, y: t.clientY - lastTouchRef.current.y };
      setPosition(clampPosition(newPos, zoom));
    } else if (e.touches.length === 2 && lastTouchRef.current?.dist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / lastTouchRef.current.dist;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * scale));
      setZoom(newZoom);
      setPosition(clampPosition(position, newZoom));
      lastTouchRef.current.dist = dist;
    }
  }, [zoom, position, clampPosition]);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
    setZoom(newZoom);
    setPosition(clampPosition(position, newZoom));
  }, [zoom, position, clampPosition]);

  // Zoom slider
  const handleZoomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newZoom = parseFloat(e.target.value);
    setZoom(newZoom);
    setPosition(clampPosition(position, newZoom));
  }, [position, clampPosition]);

  // Reset
  const handleReset = useCallback(() => {
    if (!imageSize.w) return;
    const scale = VIEWPORT / Math.min(imageSize.w, imageSize.h);
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale)));
    setPosition({ x: 0, y: 0 });
  }, [imageSize]);

  // Crop & save
  const handleSave = useCallback(async () => {
    if (!imgRef.current || !imageSize.w) return;
    setSaving(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d')!;

      // Вычисляем какую часть исходного изображения показывает viewport
      const cropSizeInOriginal = VIEWPORT / zoom;
      const centerX = imageSize.w / 2 - position.x / zoom;
      const centerY = imageSize.h / 2 - position.y / zoom;
      const sx = centerX - cropSizeInOriginal / 2;
      const sy = centerY - cropSizeInOriginal / 2;

      ctx.drawImage(imgRef.current, sx, sy, cropSizeInOriginal, cropSizeInOriginal, 0, 0, outputSize, outputSize);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.9),
      );

      if (!blob) throw new Error('Canvas toBlob failed');
      const croppedFile = new File([blob], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' });
      onCrop(croppedFile);
    } catch {
      // Fallback: вернуть оригинал
      onCrop(file);
    } finally {
      setSaving(false);
    }
  }, [imageSize, zoom, position, outputSize, file, onCrop]);

  // Escape закрывает
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-[400px] w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Настройка аватара</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Crop area */}
        <div className="flex justify-center py-6 px-4 bg-gray-50 dark:bg-gray-950">
          <div
            ref={containerRef}
            className="relative overflow-hidden rounded-full select-none touch-none"
            style={{ width: VIEWPORT, height: VIEWPORT }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onWheel={handleWheel}
          >
            {/* Тёмный фон */}
            <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800" />

            {/* Изображение */}
            {imageSrc && (
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Кроп аватара"
                className="absolute select-none pointer-events-none"
                draggable={false}
                onLoad={handleImageLoad}
                style={{
                  width: imageSize.w * zoom,
                  height: imageSize.h * zoom,
                  left: `calc(50% - ${(imageSize.w * zoom) / 2 - position.x}px)`,
                  top: `calc(50% - ${(imageSize.h * zoom) / 2 - position.y}px)`,
                }}
              />
            )}

            {/* Круговая маска с подсветкой границы */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.3)',
              }}
            />

            {/* Cursor hint */}
            <div className="absolute inset-0 cursor-grab active:cursor-grabbing" />
          </div>
        </div>

        {/* Zoom controls */}
        <div className="px-5 py-3 flex items-center gap-3">
          <button
            onClick={() => {
              const nz = Math.max(MIN_ZOOM, zoom - ZOOM_STEP * 3);
              setZoom(nz);
              setPosition(clampPosition(position, nz));
            }}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            aria-label="Уменьшить"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={handleZoomChange}
            className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <button
            onClick={() => {
              const nz = Math.min(MAX_ZOOM, zoom + ZOOM_STEP * 3);
              setZoom(nz);
              setPosition(clampPosition(position, nz));
            }}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            aria-label="Увеличить"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-xs text-gray-400 tabular-nums w-10 text-right">{zoomPercent}%</span>
          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
            aria-label="Сбросить"
            title="Сбросить"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !imageSrc}
            className="px-5 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 disabled:opacity-50 rounded-lg transition-colors"
          >
            {saving ? 'Сохранение...' : 'Применить'}
          </button>
        </div>
      </div>
    </div>
  );
}
