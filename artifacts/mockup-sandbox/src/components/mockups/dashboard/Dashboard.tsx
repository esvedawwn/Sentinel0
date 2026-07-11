import React from 'react';
import { Settings, RefreshCw, Activity, AlertTriangle, FileText, ImageIcon, Box, CircleDashed } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="min-h-screen font-sans" style={{ background: '#111111', color: '#FFFFFF' }}>
      
      {/* Top Nav Strip */}
      <div className="flex items-center justify-between px-6 py-4" style={{ background: '#111111', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-4">
          <span className="font-mono font-bold tracking-widest text-sm uppercase">Sentinel</span>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded uppercase tracking-wider" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
            v0.1-α
          </span>
        </div>
        
        <div className="flex items-center gap-8">
          <span className="font-mono text-xs uppercase tracking-widest cursor-pointer" style={{ color: '#FFFFFF' }}>Overview</span>
          <span className="font-mono text-xs uppercase tracking-widest cursor-pointer transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.4)' }}>Analyse</span>
          <span className="font-mono text-xs uppercase tracking-widest cursor-pointer transition-colors hover:text-white" style={{ color: 'rgba(255,255,255,0.4)' }}>Reports</span>
        </div>
        
        <div className="flex items-center gap-4">
          <button className="p-2 rounded-full transition-colors hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <RefreshCw size={16} />
          </button>
          <button className="p-2 rounded-full transition-colors hover:bg-white/5" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative w-full overflow-hidden flex items-center justify-center" style={{ height: '380px', background: '#111111', backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
        
        {/* Left Title */}
        <div className="absolute left-10 top-1/2 -translate-y-1/2 flex flex-col gap-3">
          <h1 className="text-5xl font-bold tracking-tight" style={{ color: '#FFFFFF' }}>File Intelligence</h1>
          <span className="font-mono text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>
            ID 2025-07-11
          </span>
        </div>

        {/* Center Radial Visual */}
        <div className="relative flex items-center justify-center z-10" style={{ width: '280px', height: '280px' }}>
          <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 280 280">
            <circle cx="140" cy="140" r="130" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="2" />
            <circle cx="140" cy="140" r="120" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
            <circle cx="140" cy="140" r="120" fill="none" stroke="#34D399" strokeWidth="12" strokeDasharray="753.98" strokeDashoffset={753.98 - (753.98 * 0.78)} strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 16px rgba(52,211,153,0.5))' }} />
          </svg>
          <div className="text-center flex flex-col items-center">
            <span className="font-mono font-bold tracking-tighter" style={{ color: '#34D399', fontSize: '4.5rem', lineHeight: 1 }}>78<span className="text-3xl text-white/30" style={{ marginLeft: '4px' }}>%</span></span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] mt-3" style={{ color: 'rgba(255,255,255,0.5)' }}>Organised</span>
          </div>
        </div>

        {/* Right Floating Card */}
        <div className="absolute top-10 right-10 p-5 flex flex-col shadow-2xl backdrop-blur-md" style={{ background: 'rgba(26,26,26,0.85)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', width: '260px' }}>
          <span className="font-mono text-[10px] uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>Space Recoverable</span>
          <span className="font-mono font-bold text-4xl mb-4 tracking-tight" style={{ color: '#FFFFFF' }}>2.4 <span className="text-lg text-white/30">GB</span></span>
          
          <div className="w-full h-8 mb-3 opacity-80">
            <svg width="100%" height="100%" viewBox="0 0 200 30" preserveAspectRatio="none">
              <path d="M0,25 Q20,10 40,20 T80,15 T120,25 T160,10 T200,20" fill="none" stroke="#34D399" strokeWidth="2" style={{ filter: 'drop-shadow(0 2px 4px rgba(52,211,153,0.4))' }} />
              <path d="M0,25 Q20,10 40,20 T80,15 T120,25 T160,10 T200,20 L200,30 L0,30 Z" fill="url(#sparkGradient)" stroke="none" />
              <defs>
                <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(52,211,153,0.15)" />
                  <stop offset="100%" stopColor="rgba(52,211,153,0)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: '#34D399', boxShadow: '0 0 8px rgba(52,211,153,0.8)' }}></div>
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: '#34D399' }}>Optimal</span>
          </div>
        </div>

      </div>

      {/* Metrics Row */}
      <div className="p-8 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-4 gap-6">
          
          {/* Card 1: Total Files */}
          <div className="p-6 flex flex-col justify-between" style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', minHeight: '220px' }}>
            <div>
              <span className="font-mono text-xs uppercase tracking-widest block mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Total Files</span>
              <span className="font-mono font-bold text-4xl block mb-6 tracking-tight" style={{ color: '#FFFFFF' }}>48,293</span>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#60A5FA' }}></div>
                  <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Documents</span>
                </div>
                <span className="font-mono text-xs font-bold text-white">18,241</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#C4B5FD' }}></div>
                  <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Images</span>
                </div>
                <span className="font-mono text-xs font-bold text-white">14,832</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }}></div>
                  <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Other</span>
                </div>
                <span className="font-mono text-xs font-bold text-white">15,220</span>
              </div>
              
              <div className="flex w-full h-1.5 rounded-full overflow-hidden mt-4 bg-white/5">
                <div style={{ width: '38%', background: '#60A5FA' }}></div>
                <div style={{ width: '31%', background: '#C4B5FD' }}></div>
                <div style={{ width: '31%', background: 'rgba(255,255,255,0.2)' }}></div>
              </div>
            </div>
          </div>

          {/* Card 2: Organised */}
          <div className="p-6 flex flex-col justify-between relative overflow-hidden" style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', minHeight: '220px' }}>
            <div>
              <span className="font-mono text-xs uppercase tracking-widest block mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Organised</span>
              <span className="font-mono font-bold text-4xl block mb-2 tracking-tight" style={{ color: '#34D399' }}>78<span className="text-2xl text-white/30 ml-1">%</span></span>
              <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: 'rgba(52,211,153,0.7)' }}>+2.4% this week</span>
            </div>

            <div className="mt-6">
              <div className="flex items-end justify-between mb-2">
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Index Health</span>
                <span className="font-mono text-xs text-white">Good</span>
              </div>
              <div className="w-full h-2 rounded-full flex gap-1">
                <div className="h-full flex-1 rounded-l-full" style={{ background: 'rgba(255,255,255,0.1)' }}></div>
                <div className="h-full flex-1" style={{ background: 'rgba(255,255,255,0.1)' }}></div>
                <div className="h-full flex-1" style={{ background: '#34D399', boxShadow: '0 0 10px rgba(52,211,153,0.3)' }}></div>
              </div>
            </div>
          </div>

          {/* Card 3: Duplicates */}
          <div className="p-6 flex flex-col justify-between" style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', minHeight: '220px' }}>
            <div className="flex justify-between items-start">
              <div>
                <span className="font-mono text-xs uppercase tracking-widest block mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Duplicates</span>
                <span className="font-mono font-bold text-4xl block mb-2 tracking-tight" style={{ color: '#FBBF24' }}>1,847</span>
                <span className="font-mono text-[10px] px-2 py-1 rounded bg-[#FBBF24]/10 uppercase tracking-widest" style={{ color: '#FBBF24' }}>Needs Review</span>
              </div>
              
              <div className="relative w-12 h-12">
                <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#FBBF24" strokeWidth="3" strokeDasharray="100" strokeDashoffset="65" />
                </svg>
              </div>
            </div>

            <div className="space-y-3 mt-6">
              <div className="flex justify-between items-center pb-2" style={{ borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Exact Match</span>
                <span className="font-mono text-xs text-white">1,204</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Similar Match</span>
                <span className="font-mono text-xs text-white">643</span>
              </div>
            </div>
          </div>

          {/* Card 4: Findings */}
          <div className="p-6 flex flex-col justify-between" style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', minHeight: '220px' }}>
            <span className="font-mono text-xs uppercase tracking-widest block mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Findings</span>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <span className="font-mono font-bold text-3xl block tracking-tight" style={{ color: '#F87171' }}>3.2k</span>
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'rgba(248,113,113,0.7)' }}>Active</span>
              </div>
              <div>
                <span className="font-mono font-bold text-3xl block tracking-tight" style={{ color: 'rgba(255,255,255,0.8)' }}>891</span>
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>Resolved</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: '#F87171' }}>Corrupted</span>
                <div className="w-16 h-1 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-[#F87171]" style={{ width: '45%' }}></div></div>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: '#FBBF24' }}>Duplicate</span>
                <div className="w-16 h-1 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-[#FBBF24]" style={{ width: '30%' }}></div></div>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.6)' }}>Large File</span>
                <div className="w-16 h-1 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-white/40" style={{ width: '80%' }}></div></div>
              </div>
            </div>
            
          </div>
          
        </div>
      </div>
      
    </div>
  );
}
