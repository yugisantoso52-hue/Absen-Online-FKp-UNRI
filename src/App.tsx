/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Camera, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  History, 
  User, 
  Lock, 
  Navigation,
  LogOut,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// Office Configuration
const OFFICE_LOCATIONS = [
  { name: "Kampus Panam", lat: 0.469213, lon: 101.3793428 },
  { name: "Kampus Gobah", lat: 0.5130534, lon: 101.4562368 }
];
const ALLOWED_RADIUS_METERS = 100;
const LOGO_URL = "https://lh3.googleusercontent.com/d/1l4fSPxAEbdYhfo7CP43m30ImS1Qc893h";
const GAS_URL = "https://script.google.com/macros/s/AKfycbw-t74KoT3JnCYD6zumooZ8v9gsMr661U3gTgmQyfjRfpGBF70OxLXtbtq7WR7MJ5wwig/exec";

// Generate or retrieve a persistent device fingerprint
const getDeviceId = () => {
  let id = localStorage.getItem('absensi_device_id');
  if (!id) {
    id = 'DEV-' + Math.random().toString(36).substring(2, 9).toUpperCase() + '-' + Date.now();
    localStorage.setItem('absensi_device_id', id);
  }
  return id;
};

interface AttendanceRecord {
  id: string;
  name: string;
  status: string;
  timestamp: string;
  date: string;
  distance: number;
  locationName: string;
}

export default function App() {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'Masuk' | 'Pulang'>('Masuk');
  const [isCapturing, setIsCapturing] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [nearestOffice, setNearestOffice] = useState<typeof OFFICE_LOCATIONS[0] | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [deviceId] = useState(getDeviceId());

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Update Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load History
  useEffect(() => {
    const saved = localStorage.getItem('absensi_history');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  const saveToHistory = (record: AttendanceRecord) => {
    const newHistory = [record, ...history].slice(0, 5);
    setHistory(newHistory);
    localStorage.setItem('absensi_history', JSON.stringify(newHistory));
  };

  // Distance Calculation
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + 
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Get Location and find nearest office
  const refreshLocation = useCallback(() => {
    setFeedback({ type: 'info', message: 'Mendeteksi lokasi kampus...' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setLocation({ lat, lon });
        
        // Find nearest campus
        let minDistance = Infinity;
        let selectedOffice = OFFICE_LOCATIONS[0];

        OFFICE_LOCATIONS.forEach(office => {
          const d = calculateDistance(lat, lon, office.lat, office.lon);
          if (d < minDistance) {
            minDistance = d;
            selectedOffice = office;
          }
        });

        setDistance(minDistance);
        setNearestOffice(selectedOffice);
        setFeedback(null);
      },
      (err) => {
        setFeedback({ type: 'error', message: 'Aktifkan GPS Anda untuk melanjutkan.' });
      },
      { enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => {
    refreshLocation();
  }, [refreshLocation]);

  // Handle Camera
  useEffect(() => {
    if (isCapturing && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => {
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(() => setFeedback({ type: 'error', message: 'Gagal mengakses kamera.' }));
    }
    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, [isCapturing]);

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setPhoto(dataUrl);
      setIsCapturing(false);
    }
  };

  const resetForm = () => {
    setName('');
    setPassword('');
    setPhoto(null);
    setFeedback(null);
  };

  const handleAbsen = async () => {
    if (!name || !password) {
      setFeedback({ type: 'error', message: 'Harap isi Nama dan Password.' });
      return;
    }

    if (password !== "admin123") {
      setFeedback({ type: 'error', message: 'Password salah.' });
      return;
    }

    // Lock check: Max 2 entries per day per person
    const todayStr = new Date().toLocaleDateString('id-ID');
    const userTodayCount = history.filter(h => h.name === name && h.date === todayStr).length;

    if (userTodayCount >= 2) {
      setFeedback({ type: 'error', message: 'Batas absensi harian tercapai (Maks 2x).' });
      return;
    }

    if (!location || distance === null || !nearestOffice) {
      setFeedback({ type: 'error', message: 'Lokasi belum terdeteksi.' });
      return;
    }

    if (distance > ALLOWED_RADIUS_METERS) {
      setFeedback({ type: 'error', message: `Di luar area ${nearestOffice.name} (Jarak: ${Math.round(distance)}m)` });
      return;
    }

    if (!photo) {
      setFeedback({ type: 'error', message: 'Ambil foto sebagai verifikasi.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback({ type: 'info', message: 'Mengirim data...' });

    const dataToSend = {
      nama: name,
      status: status,
      lat: location.lat,
      lon: location.lon,
      lokasiDetail: nearestOffice.name,
      foto: photo,
      deviceId: deviceId,
      userAgent: navigator.userAgent
    };

    try {
      await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(dataToSend),
        mode: "no-cors" 
      });

      setFeedback({ type: 'success', message: 'Absensi berhasil!' });
      saveToHistory({
        id: Date.now().toString(),
        name,
        status,
        timestamp: new Date().toLocaleTimeString('id-ID'),
        date: new Date().toLocaleDateString('id-ID'),
        distance: Math.round(distance),
        locationName: nearestOffice.name
      });
      resetForm();
    } catch (err) {
      setFeedback({ type: 'error', message: 'Gagal mengirim data. Coba lagi.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white md:bg-neutral-50 grid-bg p-0 md:p-6 lg:p-8 flex items-start justify-center overflow-x-hidden">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-0 md:gap-6 bg-white md:bg-transparent shadow-2xl md:shadow-none min-h-screen md:min-h-0">
        
        {/* Left Column: Core Actions */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="lg:col-span-7 flex flex-col gap-4 md:gap-6"
        >
          {/* Mobile Header (Hidden on Desktop) */}
          <div className="md:hidden glass p-4 flex items-center justify-between border-b border-neutral-100 sticky top-0 z-50">
             <div className="flex items-center gap-3">
               <img src={LOGO_URL} alt="Logo" className="w-11 h-11 object-contain" />
               <div className="flex flex-col">
                  <h2 className="text-[11px] font-black text-brand-primary uppercase leading-tight">Fakultas Keperawatan</h2>
                  <p className="text-[9px] font-black text-brand-primary tracking-wider uppercase">Universitas Riau</p>
                  
                  <div className="mt-1.5 flex flex-col">
                    <p className="text-[10px] font-black text-warning tracking-widest uppercase leading-none">Presensi Digital</p>
                    <div className="flex items-center gap-1 mt-0.5">
                       <div className="w-1 h-1 rounded-full bg-warning animate-pulse" />
                       <p className="text-[7px] font-bold text-warning uppercase leading-tight">Verified System</p>
                    </div>
                  </div>
               </div>
             </div>
             <div className="text-right bg-neutral-900 text-white px-3 py-1.5 rounded-xl shadow-lg border border-neutral-800">
                <p className="text-xs font-mono font-bold leading-none">{currentTime.toLocaleTimeString('id-ID', { hour12: false })}</p>
                <p className="text-[7px] text-neutral-400 font-bold uppercase tracking-widest mt-0.5">{currentTime.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
             </div>
          </div>

          {/* Identity Header (Desktop & Large Mobile) */}
          <div className="hidden md:block glass p-6 md:p-8 rounded-3xl shadow-xl border-t-8 border-t-brand-primary overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <Clock size={160} className="text-brand-primary" />
            </div>
            
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
              <div className="flex flex-col md:flex-row items-center gap-6 w-full md:w-auto">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-white p-3 shadow-md border border-neutral-100 flex items-center justify-center flex-shrink-0">
                  <img 
                    src={LOGO_URL} 
                    alt="Logo" 
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
                    }}
                  />
                </div>
                <div className="flex flex-col justify-center items-center md:items-start text-center md:text-left overflow-hidden">
                  <h1 className="text-lg sm:text-xl md:text-2xl font-black text-brand-primary tracking-tight leading-tight uppercase">Fakultas Keperawatan</h1>
                  <p className="text-[10px] sm:text-xs font-black text-brand-primary tracking-widest uppercase mt-0.5">Universitas Riau</p>
                  
                  <div className="mt-4 flex flex-col items-center md:items-start">
                    <p className="text-sm md:text-base font-black text-warning tracking-widest uppercase leading-none">Presensi Digital</p>
                    <div className="mt-1.5 flex items-center gap-1.5 justify-center md:justify-start">
                      <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                      <span className="text-[9px] font-bold text-warning tracking-tighter uppercase">Verified System</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="w-full md:w-auto bg-neutral-900 text-white p-6 rounded-3xl flex items-center gap-6 shadow-2xl justify-center text-center">
                <div className="space-y-1">
                   <div className="text-3xl font-mono font-black leading-none tracking-tighter">
                    {currentTime.toLocaleTimeString('id-ID', { hour12: false })}
                   </div>
                   <div className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                    {currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                   </div>
                </div>
                <Clock className="text-brand-primary animate-pulse hidden sm:block" size={32} />
              </div>
            </div>
          </div>

          {/* Quick Selection (Mobile Grid Optimized) */}
          <div className="px-4 md:px-0 grid grid-cols-2 gap-3 md:gap-4">
              <button 
                onClick={() => setStatus('Masuk')}
                className={cn(
                  "relative group overflow-hidden p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3",
                  status === 'Masuk' 
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-md" 
                    : "border-neutral-100 text-neutral-400 hover:border-neutral-200"
                )}
              >
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shadow-sm", status === 'Masuk' ? "bg-emerald-500 text-white" : "bg-neutral-100")}>
                  <Navigation size={24} />
                </div>
                <span className="font-black text-xs tracking-widest uppercase">ABSEN MASUK</span>
                {status === 'Masuk' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-500" />}
              </button>
              
              <button 
                onClick={() => setStatus('Pulang')}
                className={cn(
                  "relative group overflow-hidden p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3",
                  status === 'Pulang' 
                    ? "border-orange-500 bg-orange-50 text-orange-700 shadow-md" 
                    : "border-neutral-100 text-neutral-400 hover:border-neutral-200"
                )}
              >
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shadow-sm", status === 'Pulang' ? "bg-orange-500 text-white" : "bg-neutral-100")}>
                  <LogOut size={24} />
                </div>
                <span className="font-black text-xs tracking-widest uppercase">ABSEN PULANG</span>
                {status === 'Pulang' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-1 bg-orange-500" />}
              </button>
            </div>

          {/* Input & Photo (Responsive Grid) */}
          <div className="glass p-6 md:p-8 rounded-3xl shadow-xl space-y-6 md:space-y-8 mx-0 md:mx-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-center">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Nama Lengkap</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" size={18} />
                    <input 
                      type="text" 
                      placeholder="Input nama anda..." 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 rounded-2xl bg-neutral-50 border border-neutral-100 focus:outline-none focus:ring-4 focus:ring-brand-primary/10 transition-all font-bold text-neutral-800"
                    />
                  </div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" size={18} />
                    <input 
                      type="password" 
                      placeholder="••••••••" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 rounded-2xl bg-neutral-50 border border-neutral-100 focus:outline-none focus:ring-4 focus:ring-brand-primary/10 transition-all font-bold tracking-widest"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center">
                <div className="relative group w-full aspect-square max-w-[240px] rounded-3xl bg-neutral-900 overflow-hidden shadow-2xl border-4 border-white">
                  {photo ? (
                    <>
                      <img src={photo} alt="Identity" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => { setPhoto(null); setIsCapturing(true); }}
                        className="absolute inset-0 bg-brand-primary/80 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center text-white gap-2 font-black text-xs tracking-tighter"
                      >
                        <RefreshCw size={24} /> ULANGI FOTO
                      </button>
                    </>
                  ) : isCapturing ? (
                    <div className="relative w-full h-full">
                      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
                      <div className="absolute inset-4 border-2 border-white/20 border-dashed rounded-2xl pointer-events-none" />
                      <button 
                        onClick={takePhoto}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full border-4 border-white bg-brand-primary flex items-center justify-center shadow-xl active:scale-90 transition-transform"
                      >
                        <Camera className="text-white" size={24} />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setIsCapturing(true)}
                      className="w-full h-full flex flex-col items-center justify-center gap-4 text-neutral-600 hover:text-brand-primary hover:bg-neutral-800 transition-all"
                    >
                      <div className="w-16 h-16 rounded-full border-4 border-dashed border-neutral-700 flex items-center justify-center">
                        <Camera size={28} />
                      </div>
                      <p className="text-[10px] font-black tracking-widest uppercase text-center px-4">Ambil Foto Verifikasi</p>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <canvas ref={canvasRef} className="hidden" />

            <button 
              onClick={handleAbsen}
              disabled={isSubmitting}
              className={cn(
                "w-full py-5 rounded-2xl flex items-center justify-center gap-3 font-black text-lg shadow-[0_10px_20px_-10px_rgba(0,102,255,0.4)] transition-all uppercase tracking-widest",
                isSubmitting ? "bg-neutral-100 text-neutral-400 cursor-not-allowed" : "bg-brand-primary text-white hover:bg-blue-600 hover:-translate-y-1 active:translate-y-0"
              )}
            >
              {isSubmitting ? <RefreshCw className="animate-spin" /> : "Proses Kehadiran"}
            </button>

            <AnimatePresence>
              {feedback && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    "p-5 rounded-2xl flex items-center gap-4 border-2 shadow-sm",
                    feedback.type === 'success' && "bg-emerald-50 text-emerald-800 border-emerald-100",
                    feedback.type === 'error' && "bg-rose-50 text-rose-800 border-rose-100",
                    feedback.type === 'info' && "bg-blue-50 text-blue-800 border-blue-100"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                    feedback.type === 'success' && "bg-emerald-500 text-white",
                    feedback.type === 'error' && "bg-rose-500 text-white",
                    feedback.type === 'info' && "bg-blue-500 text-white"
                  )}>
                    {feedback.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                  </div>
                  <span className="text-sm font-black">{feedback.message}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Right Column */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-5 flex flex-col gap-6"
        >
          {/* Location Verification */}
          <div className="glass rounded-3xl overflow-hidden shadow-xl border border-white">
            <div className="p-5 border-b border-neutral-100 flex justify-between items-center bg-white/50 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
                  <MapPin size={18} />
                </div>
                <span className="font-black text-xs uppercase tracking-widest text-neutral-800">Verifikasi GPS</span>
              </div>
              <button 
                onClick={refreshLocation} 
                className="p-2 hover:bg-neutral-100 rounded-xl transition-all active:rotate-180"
              >
                <RefreshCw size={16} className="text-neutral-400" />
              </button>
            </div>
            
            <div className="p-8">
              {location && nearestOffice ? (
                <div className="space-y-8">
                  <div className="relative aspect-[4/3] rounded-3xl bg-neutral-900 overflow-hidden border-4 border-white shadow-inner">
                    <div className="absolute inset-0 grid-bg opacity-20" />
                    
                    <div className="absolute inset-0 flex items-center justify-center">
                       <div className="relative">
                          {/* Radius visualizer */}
                          <motion.div 
                             initial={{ scale: 0 }}
                             animate={{ scale: 1 }}
                             className={cn(
                              "w-48 h-48 rounded-full border-4 transition-all opacity-20",
                              (distance || 0) <= ALLOWED_RADIUS_METERS ? "bg-emerald-400 border-emerald-500" : "bg-rose-400 border-rose-500"
                            )} 
                          />
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                            <motion.div 
                              animate={{ y: [0, -6, 0] }}
                              transition={{ repeat: Infinity, duration: 1.5 }}
                              className={cn(
                                "drop-shadow-2xl",
                                (distance || 0) <= ALLOWED_RADIUS_METERS ? "text-emerald-400" : "text-rose-400"
                              )}
                            >
                              <MapPin size={48} fill="currentColor" />
                            </motion.div>
                            <div className="mt-2 bg-white px-3 py-1 rounded-full shadow-lg border border-neutral-100">
                               <p className="text-[10px] font-black text-neutral-800 tracking-tighter">LOKASI ANDA</p>
                            </div>
                          </div>
                       </div>
                    </div>

                    <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-3 rounded-2xl border border-white flex justify-between items-center shadow-lg">
                      <div>
                        <p className="text-[8px] font-black text-neutral-400 uppercase leading-none mb-1">Kampus Terdekat</p>
                        <p className="text-xs font-black text-brand-primary">{nearestOffice.name.toUpperCase()}</p>
                      </div>
                      <div className="text-right">
                         <p className="text-[8px] font-black text-neutral-400 uppercase leading-none mb-1">Keterangan</p>
                         <p className={cn(
                          "text-[10px] font-black",
                          (distance || 0) <= ALLOWED_RADIUS_METERS ? "text-emerald-600" : "text-rose-600"
                         )}>
                           {(distance || 0) <= ALLOWED_RADIUS_METERS ? "DALAM RADIUS" : "DILUAR RADIUS"}
                         </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100 flex flex-col items-center">
                      <p className="text-[9px] text-neutral-400 font-black uppercase tracking-widest mb-1">Jarak</p>
                      <p className={cn(
                        "text-3xl font-mono font-black",
                        (distance || 0) <= ALLOWED_RADIUS_METERS ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {distance ? Math.round(distance) : "0"}m
                      </p>
                    </div>
                    <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100 flex flex-col items-center">
                      <p className="text-[9px] text-neutral-400 font-black uppercase tracking-widest mb-1">Batas Ijin</p>
                      <p className="text-3xl font-mono font-black text-neutral-800">
                        {ALLOWED_RADIUS_METERS}m
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-16 flex flex-col items-center gap-6 text-neutral-400 text-center">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                    className="w-16 h-16 rounded-full border-4 border-dashed border-neutral-200 flex items-center justify-center"
                  >
                    <Navigation size={32} className="opacity-20" />
                  </motion.div>
                  <p className="text-sm font-black uppercase tracking-widest animate-pulse">Mencari Posisi GPS...</p>
                </div>
              )}
            </div>
          </div>

          {/* Activity Log */}
          <div className="glass rounded-3xl overflow-hidden shadow-xl flex-1 flex flex-col">
            <div className="p-5 border-b border-neutral-100 flex items-center gap-3 bg-white/50 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-600 flex items-center justify-center">
                <History size={18} />
              </div>
              <span className="font-black text-xs uppercase tracking-widest text-neutral-800">Riwayat Presensi</span>
            </div>
            <div className="p-4 flex-1">
              {history.length > 0 ? (
                <div className="space-y-3">
                  {history.map((record) => (
                    <motion.div 
                      key={record.id} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-4 bg-white hover:shadow-md rounded-2xl flex items-center justify-between border border-neutral-50 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-3 h-12 rounded-full",
                          record.status === 'Masuk' ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]" : "bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.3)]"
                        )} />
                        <div>
                          <p className="text-sm font-black text-neutral-800 group-hover:text-brand-primary transition-colors">{record.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[9px] font-black text-neutral-400 uppercase">{record.status} • {record.timestamp}</span>
                             <span className="w-1 h-1 rounded-full bg-neutral-200" />
                             <span className="text-[9px] font-black text-brand-primary uppercase">{record.locationName}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono font-black text-neutral-400">{record.distance}m</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center py-12 text-neutral-300 gap-3">
                  <User size={40} className="opacity-10" />
                  <p className="text-[10px] font-black uppercase tracking-widest italic opacity-40">Belum ada riwayat</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
