import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const [dockerStatus, setDockerStatus] = useState<'CONNECTED' | 'DISCONNECTED' | 'CHECKING'>('CHECKING');
  const [dockerOS, setDockerOS] = useState<string | null>(null);

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard':
        return 'Overview';
      case '/containers':
        return 'Containers';
      case '/images':
        return 'Images';
      case '/events':
        return 'Events Timeline';
      default:
        return 'Platform';
    }
  };

  const checkConnection = async () => {
    try {
      const health = await api.get('/health');
      if (health.status === 'OK' && health.docker === 'Connected') {
        setDockerStatus('CONNECTED');
        setDockerOS(health.dockerOS || 'Linux');
      } else {
        setDockerStatus('DISCONNECTED');
      }
    } catch (err) {
      setDockerStatus('DISCONNECTED');
    }
  };

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 border-b border-[rgba(255,255,255,0.06)] bg-[#121418]/60 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-10 select-none font-sans">
      <div className="flex items-center gap-4">
        <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">{getPageTitle()}</h2>
      </div>

      <div className="flex items-center gap-4">
        {/* Connection status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0B0D10]/50 border border-[rgba(255,255,255,0.08)] text-[10px] font-semibold">
          {dockerStatus === 'CONNECTED' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              <span className="text-zinc-400">Daemon Connected ({dockerOS})</span>
            </>
          ) : dockerStatus === 'DISCONNECTED' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-red-400">Daemon Offline</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
              <span className="text-zinc-550">Verifying socket connection...</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
