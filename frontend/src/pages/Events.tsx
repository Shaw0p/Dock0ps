import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import {
  Activity,
  Trash2,
  Search,
  Layers,
  Boxes,
  Network,
  HardDrive,
  Cpu,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DockerEvent {
  action: string;
  type: string;
  actor: {
    name: string;
    id: string;
    attributes: Record<string, string>;
  };
  time: number;
}

export const Events: React.FC = () => {
  const socket = useSocket();
  const [events, setEvents] = useState<DockerEvent[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!socket) return;

    const handleEvent = (evt: DockerEvent) => {
      setEvents((prev) => [evt, ...prev].slice(0, 150));
    };
    socket.on('docker-event', handleEvent);

    return () => {
      socket.off('docker-event', handleEvent);
    };
  }, [socket]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'container':
        return <Boxes size={14} className="text-blue-400" />;
      case 'image':
        return <Layers size={14} className="text-purple-400" />;
      case 'network':
        return <Network size={14} className="text-emerald-400" />;
      case 'volume':
        return <HardDrive size={14} className="text-amber-400" />;
      default:
        return <Cpu size={14} className="text-zinc-500" />;
    }
  };

  const filteredEvents = events.filter((evt) => {
    const query = search.toLowerCase();
    return (
      evt.action.toLowerCase().includes(query) ||
      evt.type.toLowerCase().includes(query) ||
      evt.actor.name.toLowerCase().includes(query) ||
      evt.actor.id.toLowerCase().includes(query)
    );
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.3 }}
      className="space-y-8 max-w-6xl mx-auto font-sans p-6 text-white"
    >
      
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,255,255,0.06)] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
            Listening to daemon stream
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter timeline..."
              className="w-40 sm:w-56 pl-9 pr-3 py-1.5 bg-[#121418] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs placeholder-zinc-700 focus:outline-none focus:border-zinc-700 text-zinc-350"
            />
          </div>
          <button
            onClick={() => setEvents([])}
            className="px-3 py-1.5 border border-[rgba(255,255,255,0.08)] hover:border-zinc-700 bg-[#121418] text-zinc-400 hover:text-white rounded-xl text-xs flex items-center gap-1 font-semibold cursor-pointer transition-colors"
          >
            <Trash2 size={12} />
            Clear
          </button>
        </div>
      </div>

      {/* Timeline Stream Box */}
      <div className="border border-[rgba(255,255,255,0.08)] bg-[#121418] rounded-xl overflow-hidden shadow-sm">
        {filteredEvents.length === 0 ? (
          <div className="p-16 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
            <Activity size={32} className="text-zinc-750" />
            <p className="font-bold text-xs text-zinc-400 uppercase tracking-wider">Timeline Idle</p>
            <p className="text-xs text-zinc-600 max-w-xs leading-relaxed">Events from container runtime will stream here in real-time.</p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(255,255,255,0.05)] max-h-[60vh] overflow-y-auto text-xs">
            <AnimatePresence initial={false}>
              {filteredEvents.map((evt, idx) => {
                const date = new Date(evt.time * 1000).toLocaleTimeString();
                const name = evt.actor.name || evt.actor.id.slice(0, 12);
                
                return (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    key={`${evt.time}-${idx}`}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-zinc-900/10 gap-3"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="p-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-lg">
                        {getIcon(evt.type)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-zinc-350">
                          <span className="font-bold uppercase text-[9px] text-zinc-500">
                            {evt.type}
                          </span>
                          <span className="font-bold text-indigo-400">{evt.action}</span>
                          <span className="text-zinc-755 font-mono">•</span>
                          <span className="font-semibold select-all font-mono truncate max-w-[180px]" title={name}>
                            {name}
                          </span>
                        </div>
                        {Object.keys(evt.actor.attributes).length > 0 && (
                          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1 text-[10px] text-zinc-500 font-mono">
                            {Object.entries(evt.actor.attributes)
                              .slice(0, 2)
                              .map(([k, v]) => (
                                <span key={k}>
                                  {k}:<span className="text-zinc-400 select-all">{v}</span>
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <span className="text-zinc-550 text-[10px] self-end sm:self-center font-mono">{date}</span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default Events;
