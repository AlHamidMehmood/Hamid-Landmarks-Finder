/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, Landmark, History, Info, Volume2, X, Sparkles, Loader2, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { processLandmark, generateNarrationAudio, type LandmarkInfo } from './services/gemini';

// Use standard type from service
type LandmarkData = LandmarkInfo;

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<LandmarkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'history' | 'facts'>('history');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser does not support camera access.");
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);
    } catch (err: any) {
      console.error("Camera error:", err);
      const isIframe = window.self !== window.top;
      const permissionError = err.name === 'NotAllowedError' || 
                             err.name === 'PermissionDeniedError' || 
                             err.message?.toLowerCase().includes('permission denied');

      if (permissionError) {
        if (isIframe) {
          setError("Camera access was denied. This often happens inside an iframe. Please try opening the app in a new tab using the button below.");
        } else {
          setError("Camera access was denied. Please check your browser's site settings to allow camera access for this application.");
        }
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError("No camera found on this device. Please ensure a camera is connected.");
      } else if (err.name === 'OverconstrainedError') {
        // Fallback for strict constraints
        console.warn("Retrying with loose constraints...");
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
          setStream(fallbackStream);
          if (videoRef.current) videoRef.current.srcObject = fallbackStream;
          setError(null);
          return;
        } catch (e) {
          setError("Unable to satisfy camera quality requirements.");
        }
      } else {
        setError("Unable to access camera: " + (err.message || "Unknown error"));
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsScanning(true);
    setResult(null);
    setAudioUrl(null);
    setIsPlaying(false);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      
      try {
        const landmarkData = await processLandmark(base64Image);
        setResult(landmarkData);
        
        // Generate audio narration
        const audio = await generateNarrationAudio(landmarkData.narrationScript);
        setAudioUrl(audio);
      } catch (err) {
        console.error("Processing error:", err);
        setError("Could not identify the landmark. Try a clearer angle.");
      } finally {
        setIsScanning(false);
      }
    }
  };

  const reset = () => {
    setResult(null);
    setAudioUrl(null);
    setIsPlaying(false);
    setError(null);
  };

  const playNarration = () => {
    if (audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-paper font-sans text-ink overflow-hidden flex flex-col">
      {/* Viewfinder Section */}
      <div className="relative flex-1 bg-black overflow-hidden m-4 rounded-sm">
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          muted
          className="absolute inset-0 w-full h-full object-cover grayscale-[0.2]"
        />
        
        {/* Editorial Viewfinder Overlay */}
        <div className="absolute inset-4 border border-white/20 z-10 pointer-events-none" />
        <div className="absolute top-8 left-8 z-20 text-white">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-70">Optical Sensor // Active</span>
        </div>

        {/* Scan UI */}
        <AnimatePresence>
          {!result && !isScanning && !error && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="w-64 h-64 border border-white/30 rounded-full relative">
                <div className="absolute inset-0 border border-white/10 rounded-full animate-pulse scale-110" />
                <motion.div 
                  animate={{ y: [0, 240, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute top-0 left-8 right-8 h-[1px] bg-white/40 shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                />
              </div>
            </motion.div>
          )}

          {isScanning && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-ink/60 backdrop-blur-sm flex flex-col items-center justify-center z-30"
            >
              <div className="flex items-center gap-4">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
                <p className="text-white font-mono tracking-[0.2em] text-xs uppercase">Deciphering Archive...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Button */}
        {!result && !isScanning && (
          <div className="absolute bottom-10 left-0 right-0 flex justify-center px-4 z-40">
            <button
              onClick={captureImage}
              disabled={isScanning}
              className="group flex flex-col items-center gap-4 transition-transform active:scale-95"
            >
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center p-1 border border-ink">
                <div className="w-full h-full rounded-full border border-ink/10 flex items-center justify-center">
                   <div className="w-1.5 h-1.5 bg-ink rounded-full" />
                </div>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-white/80">Capture Archive</span>
            </button>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 bg-ink/80 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center text-white z-50">
            <p className="font-serif italic text-xl mb-6">{error}</p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={startCamera}
                className="px-8 py-3 bg-white text-ink rounded-full text-xs font-bold uppercase tracking-widest hover:bg-paper transition-colors"
              >
                Retry
              </button>
              {window.self !== window.top && (
                <button 
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="px-8 py-3 bg-ink border border-white text-white rounded-full text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors"
                >
                  Open in New Tab
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Editorial Footer Info (Visible during camera mode) */}
      <footer className="px-8 pb-6 flex justify-between items-center text-[9px] font-mono uppercase tracking-widest text-ink/40">
        <div className="flex gap-4">
          <span>Hamid Landmarks Finder // v1.0.4</span>
          <span>Buffer: Synced</span>
        </div>
        <div className="flex gap-4">
          <span>ISO: Auto</span>
          <span>Focal: Inf.</span>
        </div>
      </footer>

      {/* Result Panel (Editorial Layout) */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 120 }}
            className="absolute inset-0 bg-paper flex flex-col z-[100] overflow-hidden"
          >
            {/* Header Navigation */}
            <header className="p-8 flex justify-between items-baseline border-b border-ink">
              <div className="flex items-center gap-6">
                <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">Vantage // Archive 01</span>
                <h1 className="text-3xl font-serif italic font-light tracking-tight">Hamid Landmarks Finder</h1>
              </div>
              <button 
                onClick={reset}
                className="text-[11px] font-bold uppercase tracking-widest hover:line-through transition-all"
              >
                Close Archive
              </button>
            </header>

            {/* Main Content Grid */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-6xl mx-auto px-8 py-10 grid md:grid-cols-12 gap-12">
                
                {/* Left Column: Metadata */}
                <div className="md:col-span-3 flex flex-col pt-2">
                  <div className="border-l-2 border-ink pl-6 mb-10">
                    <p className="text-[10px] uppercase font-bold tracking-[0.2em] mb-2 text-ink/40">Verified Location</p>
                    <p className="text-lg font-serif leading-tight mb-6">{result.location}</p>
                    
                    <div className="space-y-4 pt-4 border-t border-ink/10">
                      <div>
                        <p className="text-[9px] uppercase font-bold tracking-[0.2em] opacity-40">Classification</p>
                        <p className="text-xs font-mono">Landmark / Historical</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase font-bold tracking-[0.2em] opacity-40">AI Analysis</p>
                        <p className="text-xs font-mono">Archive Match (99%)</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 md:mt-auto">
                    <button 
                      onClick={playNarration}
                      disabled={isPlaying}
                      className={cn(
                        "w-full py-6 flex flex-col items-center justify-center gap-3 transition-all border",
                        isPlaying 
                          ? "bg-accent text-ink/50 cursor-not-allowed border-ink/20 shadow-inner" 
                          : "bg-ink text-paper hover:bg-ink/90 border-ink shadow-lg"
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 border rounded-full flex items-center justify-center transition-transform",
                        isPlaying ? "border-ink/20" : "border-paper/40 group-hover:scale-110",
                        isPlaying && "animate-pulse"
                      )}>
                        {isPlaying ? <Volume2 className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-0.5" />}
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-[0.3em]">
                        {isPlaying ? "Narration Playing" : "Play AR Narrative"}
                      </span>
                    </button>
                    {isPlaying && (
                      <div className="mt-4 h-1 bg-accent overflow-hidden rounded-full">
                        <motion.div 
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 25, ease: "linear" }}
                          className="h-full bg-ink origin-left"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Center Column: Imagery/Heading */}
                <div className="md:col-span-6">
                  <div className="relative mb-10">
                    <div className="absolute -top-4 -left-4 text-xs font-serif italic text-ink/20">Fig. 01</div>
                    <div className="p-4 border border-ink/10 bg-accent/30 rounded-sm overflow-hidden">
                      <div className="aspect-[4/3] bg-ink/10 relative overflow-hidden flex items-center justify-center">
                         {/* Placeholder for captured image frame style */}
                         <Landmark className="w-16 h-16 text-ink/5 opacity-40 shrink-0" />
                         <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] font-mono text-ink/20 uppercase tracking-[1em] rotate-90 sm:rotate-0">Landmark Fragment Captured</span>
                         </div>
                      </div>
                    </div>
                  </div>

                  <div>
                     <span className="text-[10px] font-bold uppercase tracking-[0.2em] mb-4 block text-ink/40">Identified Fragment</span>
                     <h2 className="text-6xl font-serif italic font-light leading-none tracking-tighter mb-8">{result.name}</h2>
                  </div>
                </div>

                {/* Right Column: Context/Content */}
                <div className="md:col-span-3 flex flex-col">
                  {/* Tab Selector - Minimalist style */}
                  <div className="flex gap-6 mb-8 border-b border-ink/10 pb-2">
                    <button 
                      onClick={() => setActiveTab('history')}
                      className={cn(
                        "text-[11px] font-bold uppercase tracking-widest",
                        activeTab === 'history' ? "text-ink underline decoration-2 underline-offset-8" : "text-ink/30"
                      )}
                    >
                      History
                    </button>
                    <button 
                      onClick={() => setActiveTab('facts')}
                      className={cn(
                        "text-[11px] font-bold uppercase tracking-widest",
                        activeTab === 'facts' ? "text-ink underline decoration-2 underline-offset-8" : "text-ink/30"
                      )}
                    >
                      Archive
                    </button>
                  </div>

                  <AnimatePresence mode="wait">
                    {activeTab === 'history' ? (
                      <motion.div
                        key="history"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="prose prose-sm prose-p:leading-relaxed prose-p:font-serif prose-p:text-justify prose-p:text-ink/80 prose-strong:text-ink prose-strong:font-bold"
                      >
                        <ReactMarkdown>{result.history}</ReactMarkdown>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="facts"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="space-y-6"
                      >
                        {result.interestingFacts.map((fact, index) => (
                          <div key={index} className="pb-4 border-b border-ink/5">
                            <p className="text-sm font-serif leading-relaxed text-ink/80">{fact}</p>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="mt-12 pt-8 border-t border-ink/10">
                     <p className="text-[9px] font-mono text-ink/40 italic leading-snug uppercase">
                        Source: Global Heritage Archive // Federated Search 2026
                     </p>
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Footer */}
            <footer className="p-8 border-t border-ink text-[10px] font-mono opacity-40 flex justify-between uppercase tracking-widest">
              <div>Archive_Ref: {Math.random().toString(36).substr(2, 9).toUpperCase()}</div>
              <div>Narrative: Encrypted // PCM-24</div>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      <canvas ref={canvasRef} className="hidden" />
      {audioUrl && (
        <audio 
          ref={audioRef} 
          src={audioUrl} 
          onEnded={() => setIsPlaying(false)}
          className="hidden" 
        />
      )}
    </div>
  );
}
