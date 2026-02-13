'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { getSignedUrl } from '@/lib/signedUrl';

interface VoicePlayerProps {
  voiceKey: string;
  duration: number;
  waveform: number[];
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoicePlayer({ voiceKey, duration, waveform }: VoicePlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Normalize waveform to 30 bars
  const bars = waveform.length > 0
    ? normalizeWaveform(waveform, 30)
    : Array(30).fill(0.3);

  // Fetch signed URL for voice file
  useEffect(() => {
    getSignedUrl(voiceKey).then(setAudioUrl).catch(() => {});
  }, [voiceKey]);

  // Create Audio element once we have the signed URL
  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });
    audio.addEventListener('ended', () => {
      setPlaying(false);
      setCurrentTime(0);
    });

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  }, [playing]);

  const cycleSpeed = useCallback(() => {
    setPlaybackRate((prev) => {
      if (prev === 1) return 1.5;
      if (prev === 1.5) return 2;
      return 1;
    });
  }, []);

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white flex-shrink-0 hover:bg-primary-600 transition-colors"
      >
        {playing ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4 ml-0.5" />
        )}
      </button>

      {/* Waveform */}
      <div className="flex-1 flex items-center gap-[2px] h-8">
        {bars.map((height, i) => {
          const barProgress = i / bars.length;
          const isPlayed = barProgress <= progress;

          return (
            <div
              key={i}
              className={`w-[3px] rounded-full transition-colors ${
                isPlayed
                  ? 'bg-primary-500'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
              style={{ height: `${Math.max(height * 100, 10)}%` }}
            />
          );
        })}
      </div>

      {/* Duration + speed */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
          {playing ? formatDuration(currentTime) : formatDuration(duration)}
        </span>
        {playing && (
          <button
            onClick={cycleSpeed}
            className="text-[10px] font-medium text-primary-500 hover:text-primary-600 bg-primary-50 dark:bg-primary-900/30 px-1 py-0.5 rounded"
          >
            {playbackRate}x
          </button>
        )}
      </div>
    </div>
  );
}

function normalizeWaveform(data: number[], targetLength: number): number[] {
  if (data.length === 0) return Array(targetLength).fill(0.3);
  const result: number[] = [];
  const step = data.length / targetLength;
  for (let i = 0; i < targetLength; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let sum = 0;
    for (let j = start; j < end && j < data.length; j++) {
      sum += data[j];
    }
    result.push(sum / (end - start));
  }
  // Normalize to 0-1
  const max = Math.max(...result, 0.01);
  return result.map((v) => v / max);
}
