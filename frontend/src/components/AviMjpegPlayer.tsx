"use client";
import React, { useEffect, useRef, useState } from "react";

interface AviFrame {
  offset: number;
  length: number;
}

interface AviMjpegPlayerProps {
  src: string;
  onClose?: () => void;
}

export default function AviMjpegPlayer({ src, onClose }: AviMjpegPlayerProps) {
  const [loading, setLoading] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<ArrayBuffer | null>(null);
  const framesRef = useRef<AviFrame[]>([]);
  const frameIntervalRef = useRef<number>(200); // default 200ms
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const playingRef = useRef(false);
  const frameIdxRef = useRef(0);

  useEffect(() => {
    playingRef.current = playing;
    frameIdxRef.current = currentFrame;
  }, [playing, currentFrame]);

  useEffect(() => {
    let active = true;

    const loadVideo = async () => {
      try {
        setLoading(true);
        setError(null);
        setDownloadProgress(0);

        const res = await fetch(src);
        if (!res.ok) throw new Error("Failed to fetch video file");
        
        const contentLength = res.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        
        if (!res.body) throw new Error("ReadableStream not supported");
        
        const reader = res.body.getReader();
        let receivedLength = 0;
        const chunks: Uint8Array[] = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedLength += value.length;
            
            if (total > 0) {
              setDownloadProgress(Math.round((receivedLength / total) * 100));
            }
          }
          if (!active) {
            reader.cancel();
            return;
          }
        }
        
        const buffer = new ArrayBuffer(receivedLength);
        const view = new Uint8Array(buffer);
        let offsetBytes = 0;
        for (const chunk of chunks) {
          view.set(chunk, offsetBytes);
          offsetBytes += chunk.length;
        }
        
        bufferRef.current = buffer;
        const dv = new DataView(buffer);
        
        // Parse RIFF AVI
        if (dv.getUint32(0, false) !== 0x52494646) throw new Error("Not a RIFF file"); // "RIFF"
        if (dv.getUint32(8, false) !== 0x41564920) throw new Error("Not an AVI file"); // "AVI "

        const offset = 12;
        const frames: AviFrame[] = [];
        let microSecPerFrame = 200000; // fallback

        const readChunks = (startOffset: number, endOffset: number, isMovi = false) => {
          let pos = startOffset;
          while (pos < endOffset) {
            if (pos + 8 > endOffset) break;
            const fourcc = dv.getUint32(pos, false); // Big endian read for string compare
            const size = dv.getUint32(pos + 4, true); // Little endian size
            
            if (fourcc === 0x4C495354) { // "LIST"
              if (pos + 12 <= endOffset) {
                const listType = dv.getUint32(pos + 8, false);
                if (listType === 0x6864726C) { // "hdrl"
                  readChunks(pos + 12, pos + 8 + size);
                } else if (listType === 0x7374726C) { // "strl"
                  readChunks(pos + 12, pos + 8 + size);
                } else if (listType === 0x6D6F7669) { // "movi"
                  readChunks(pos + 12, pos + 8 + size, true);
                }
              }
            } else if (fourcc === 0x61766968) { // "avih"
              microSecPerFrame = dv.getUint32(pos + 8, true);
            } else if (isMovi && fourcc === 0x30306463) { // "00dc"
              frames.push({ offset: pos + 8, length: size });
            }

            pos += 8 + size;
            if (size % 2 !== 0) pos += 1; // padding
          }
        };

        readChunks(offset, buffer.byteLength);

        framesRef.current = frames;
        setTotalFrames(frames.length);
        if (microSecPerFrame > 0) {
          frameIntervalRef.current = microSecPerFrame / 1000;
        }

        if (frames.length > 0) {
          renderFrame(0);
        } else {
          throw new Error("No frames found in video");
        }

        setLoading(false);
      } catch (err: any) {
        if (active) {
          setError(err.message || "Error loading video");
          setLoading(false);
        }
      }
    };

    loadVideo();

    return () => {
      active = false;
      stopLoop();
    };
  }, [src]);

  const renderFrame = async (index: number) => {
    if (!bufferRef.current || index >= framesRef.current.length || index < 0) return;
    const frame = framesRef.current[index];
    const frameData = new Uint8Array(bufferRef.current, frame.offset, frame.length);
    const blob = new Blob([frameData], { type: "image/jpeg" });
    
    try {
      const bitmap = await createImageBitmap(blob);
      const canvas = canvasRef.current;
      if (canvas) {
        // Init canvas size on first frame
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
        }
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        }
      }
      bitmap.close();
    } catch (e) {
      console.warn("Failed to decode frame", index, e);
    }
  };

  const startLoop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      let nextFrame = frameIdxRef.current + 1;
      if (nextFrame >= framesRef.current.length) {
        nextFrame = 0; // loop or stop? Let's pause at end
        stopLoop();
        setPlaying(false);
        return;
      }
      setCurrentFrame(nextFrame);
      renderFrame(nextFrame);
    }, frameIntervalRef.current);
  };

  const stopLoop = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      stopLoop();
    } else {
      if (currentFrame >= framesRef.current.length - 1) {
        setCurrentFrame(0);
        renderFrame(0);
      }
      setPlaying(true);
      startLoop();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setCurrentFrame(val);
    renderFrame(val);
  };

  const formatTime = (frames: number) => {
    const totalSecs = Math.floor((frames * frameIntervalRef.current) / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-700 w-full max-w-4xl mx-auto">
      <div className="flex justify-between items-center p-3 bg-gray-900 text-white border-b border-gray-700">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          📼 AVI MJPEG Player
        </h3>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-white transition">
            ✕
          </button>
        )}
      </div>

      <div className="relative bg-black flex items-center justify-center min-h-[300px] w-full">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/80 z-10 p-6">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <p className="mb-3">กำลังดาวน์โหลดและประมวลผลวิดีโอ...</p>
            {downloadProgress > 0 && (
              <div className="w-64 bg-gray-700 rounded-full h-2 mb-2 overflow-hidden shadow-inner">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-200 ease-out" 
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            )}
            {downloadProgress > 0 && (
              <span className="text-xs text-gray-400 font-mono">{downloadProgress}%</span>
            )}
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 bg-black/80 z-10 p-6 text-center">
            <span className="text-4xl mb-2">❌</span>
            <p>{error}</p>
          </div>
        )}
        <canvas ref={canvasRef} className="w-full h-auto max-h-[60vh] object-contain block" />
      </div>

      <div className="bg-gray-900 p-4 flex items-center gap-4">
        <button 
          onClick={togglePlay} 
          disabled={loading || !!error || totalFrames === 0}
          className="text-white hover:text-blue-400 text-2xl w-10 flex items-center justify-center disabled:opacity-50 transition"
        >
          {playing ? "⏸" : "▶"}
        </button>
        
        <span className="text-xs text-gray-400 font-mono w-12 text-right">
          {formatTime(currentFrame)}
        </span>
        
        <input 
          type="range" 
          min={0} 
          max={Math.max(0, totalFrames - 1)} 
          value={currentFrame} 
          onChange={handleSeek}
          disabled={loading || !!error || totalFrames === 0}
          className="flex-1 accent-blue-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
        />
        
        <span className="text-xs text-gray-400 font-mono w-12">
          {formatTime(totalFrames)}
        </span>
      </div>
    </div>
  );
}
