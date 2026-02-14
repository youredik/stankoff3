'use client';

import { useState, useCallback, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { X, ZoomIn, ZoomOut, RotateCcw, RotateCw } from 'lucide-react';

interface AvatarCropModalProps {
  file: File;
  outputSize?: number;
  onCrop: (croppedFile: File) => void;
  onClose: () => void;
}

/**
 * Кроп-редактор аватарки на базе react-easy-crop (индустриальный стандарт).
 *
 * - Круглая маска (cropShape="round")
 * - Зум: слайдер + колёсико мыши + pinch-to-zoom (встроено в библиотеку)
 * - Перетаскивание для позиционирования
 * - Поворот на ±90°
 * - Выходной формат: WebP 400×400 (настраивается через outputSize)
 * - Корректная работа с тяжёлыми фото (10+ МБ, высокое разрешение)
 * - Нет искажений — библиотека использует CSS transform, а не ручное позиционирование
 */
export function AvatarCropModal({ file, outputSize = 400, onCrop, onClose }: AvatarCropModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 5;

  // Загрузка файла как data URL (react-easy-crop ожидает строку)
  useEffect(() => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setImageSrc(reader.result as string);
    });
    reader.readAsDataURL(file);
  }, [file]);

  // Escape закрывает + блокировка скролла body
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  // Reset
  const handleReset = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  }, []);

  // Crop & save через Canvas
  const handleSave = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setSaving(true);

    try {
      const croppedBlob = await getCroppedImage(imageSrc, croppedAreaPixels, rotation, outputSize);
      const croppedFile = new File(
        [croppedBlob],
        file.name.replace(/\.\w+$/, '.webp'),
        { type: 'image/webp' },
      );
      onCrop(croppedFile);
    } catch {
      // Fallback: вернуть оригинал
      onCrop(file);
    } finally {
      setSaving(false);
    }
  }, [imageSrc, croppedAreaPixels, rotation, outputSize, file, onCrop]);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Настройка аватара"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-[420px] w-full overflow-hidden"
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

        {/* Crop area — react-easy-crop */}
        <div className="relative bg-gray-950" style={{ height: 320 }}>
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              objectFit="contain"
              style={{
                containerStyle: { borderRadius: 0 },
                cropAreaStyle: {
                  border: '2px solid rgba(255,255,255,0.4)',
                  boxShadow: 'none',
                },
              }}
            />
          )}
        </div>

        {/* Zoom controls */}
        <div className="px-5 py-3 flex items-center gap-3">
          <button
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.2))}
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
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:cursor-pointer"
          />

          <button
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.2))}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
            aria-label="Увеличить"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <span className="text-xs text-gray-400 tabular-nums w-10 text-right">{zoomPercent}%</span>

          {/* Rotation controls */}
          <button
            onClick={() => setRotation((r) => r - 90)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
            aria-label="Повернуть влево"
            title="Повернуть влево"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setRotation((r) => r + 90)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
            aria-label="Повернуть вправо"
            title="Повернуть вправо"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleReset}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
            aria-label="Сбросить"
            title="Сбросить"
          >
            <RotateCcw className="w-3.5 h-3.5 text-orange-400" />
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

// ──────────────────────────────────────────────────────────────────────────────
// Canvas-утилита для вырезания кропа из исходного изображения
// ──────────────────────────────────────────────────────────────────────────────

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (err) => reject(err));
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

function getRadianAngle(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Вычисляет bounding box повёрнутого прямоугольника.
 * Нужно для корректного кропа с rotation.
 */
function rotateSize(width: number, height: number, rotation: number) {
  const rad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height),
  };
}

/**
 * Вырезает область кропа из исходного изображения с учётом поворота.
 * Возвращает Blob в формате WebP.
 */
async function getCroppedImage(
  imageSrc: string,
  cropPixels: Area,
  rotation = 0,
  outputSize = 400,
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const rotSize = rotateSize(image.width, image.height, rotation);

  // Рисуем повёрнутое изображение на временном канвасе
  canvas.width = rotSize.width;
  canvas.height = rotSize.height;

  ctx.translate(rotSize.width / 2, rotSize.height / 2);
  ctx.rotate(getRadianAngle(rotation));
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  // Извлекаем пиксели кропа
  const croppedData = ctx.getImageData(
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
  );

  // Масштабируем до выходного размера
  canvas.width = outputSize;
  canvas.height = outputSize;
  ctx.clearRect(0, 0, outputSize, outputSize);

  // Сначала рисуем кроп на временном канвасе в оригинальном размере
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = cropPixels.width;
  tempCanvas.height = cropPixels.height;
  tempCanvas.getContext('2d')!.putImageData(croppedData, 0, 0);

  // Затем масштабируем на выходной канвас
  ctx.drawImage(tempCanvas, 0, 0, cropPixels.width, cropPixels.height, 0, 0, outputSize, outputSize);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      'image/webp',
      0.92,
    );
  });
}
