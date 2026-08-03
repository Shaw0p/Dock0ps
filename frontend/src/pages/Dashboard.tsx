import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import {
  Server,
  Layers,
  Terminal,
  HardDrive,
  Network,
  Workflow,
  Boxes,
  PlusCircle,
  FileCode,
  Activity,
  History,
  Download,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Link } from 'react-router-dom';

interface ActivityItem {
  id: string;
  action: string;
  details: string;
  createdAt: string;
  userEmail?: string;
}

export const Dashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const socket = useSocket();

  // Telemetry buffer & live socket events feed states
  const [systemMetrics, setSystemMetrics] = useState<any[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<any>(null);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleMetrics = (data: any) => {
      setLatestMetrics(data);
      setSystemMetrics((prev) => {
        const next = [...prev, data];
        if (next.length > 20) next.shift();
        return next;
      });
    };

    const handleEvent = (evt: any) => {
      setLiveEvents((prev) => [evt, ...prev].slice(0, 8));
      // Invalidate queries to reload counts when engine events happen
      queryClient.invalidateQueries({ queryKey: ['systemSummary'] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    };

    socket.on('system-metrics', handleMetrics);
    socket.on('docker-event', handleEvent);

    return () => {
      socket.off('system-metrics', handleMetrics);
      socket.off('docker-event', handleEvent);
    };
  }, [socket, queryClient]);

  // Fetch system summary counts
  const { data: summary } = useQuery({
    queryKey: ['systemSummary'],
    queryFn: () => api.get('/system/summary'),
    refetchInterval: 10000,
  });

  // Fetch recent audited activities history
  const { data: recentActivities = [] } = useQuery<ActivityItem[]>({
    queryKey: ['activities'],
    queryFn: () => api.get('/system/activities'),
    refetchInterval: 6000,
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getActionColor = (action: string) => {
    if (action.includes('START') || action.includes('SUCCESS') || action.includes('CREATED')) return 'text-green-400 bg-green-500/10 border-green-500/10';
    if (action.includes('STOP') || action.includes('DELETED') || action.includes('FAILED')) return 'text-red-400 bg-red-500/10 border-red-500/10';
    return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/10';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.3 }}
      className="space-y-8 max-w-6xl mx-auto font-sans p-6 text-white"
    >
      {/* Intro Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-4 border-b border-[rgba(255,255,255,0.06)]">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white leading-none">
            Operations Command
          </h1>
          <p className="text-xs text-zinc-400 mt-2 font-medium">
            Real-time status overview and engine node controls for DockOps cluster daemon.
          </p>
        </div>
      </div>

      {/* OPERATIONS CENTER CARDS GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        
        {/* Running Containers */}
        <div className="p-4 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start text-green-400">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Running Nodes</span>
            <Boxes size={14} />
          </div>
          <span className="text-xl font-bold mt-2 text-zinc-200">{summary?.counts?.runningContainers ?? 0}</span>
        </div>

        {/* Stopped Containers */}
        <div className="p-4 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start text-zinc-500">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Stopped Nodes</span>
            <Boxes size={14} />
          </div>
          <span className="text-xl font-bold mt-2 text-zinc-450">{summary?.counts?.stoppedContainers ?? 0}</span>
        </div>

        {/* Compose Stacks */}
        <div className="p-4 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start text-indigo-400">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Compose Stacks</span>
            <Workflow size={14} />
          </div>
          <span className="text-xl font-bold mt-2 text-zinc-200">{summary?.counts?.stacks ?? 0}</span>
        </div>

        {/* Docker Images */}
        <div className="p-4 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start text-pink-400">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Local Images</span>
            <Layers size={14} />
          </div>
          <span className="text-xl font-bold mt-2 text-zinc-200">{summary?.counts?.images ?? 0}</span>
        </div>

        {/* Volumes */}
        <div className="p-4 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start text-yellow-400">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Storage Drives</span>
            <HardDrive size={14} />
          </div>
          <span className="text-xl font-bold mt-2 text-zinc-200">{summary?.counts?.volumes ?? 0}</span>
        </div>

        {/* Networks */}
        <div className="p-4 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex flex-col justify-between shadow-sm">
          <div className="flex justify-between items-start text-blue-400">
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Host Networks</span>
            <Network size={14} />
          </div>
          <span className="text-xl font-bold mt-2 text-zinc-200">{summary?.counts?.networks ?? 0}</span>
        </div>

      </div>

      {/* QUICK ACTIONS BAR */}
      <div className="p-4 bg-[#121418]/30 border border-[rgba(255,255,255,0.06)] rounded-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Quick Actions Control</span>
          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/stacks"
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-xs font-semibold border border-indigo-500/20 transition-all cursor-pointer"
            >
              <PlusCircle size={12} /> Create Stack
            </Link>
            <Link
              to="/images"
              className="flex items-center gap-2 px-3.5 py-2 bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 rounded-lg text-xs font-semibold border border-pink-500/20 transition-all cursor-pointer"
            >
              <Download size={12} /> Pull Registry Image
            </Link>
            <Link
              to="/containers"
              className="flex items-center gap-2 px-3.5 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-xs font-semibold border border-green-500/20 transition-all cursor-pointer"
            >
              <FileCode size={12} /> Create Container Node
            </Link>
          </div>
        </div>
      </div>

      {/* INFRASTRUCTURE TELEMETRY SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Telemetry charts */}
        <div className="lg:col-span-8 p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl space-y-5 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center pb-2 border-b border-white/[0.04]">
            <div>
              <h3 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-2">
                <Activity size={14} className="text-indigo-400" /> Daemon Telemetry Loader
              </h3>
              <p className="text-[9px] text-zinc-500 font-medium mt-1">Real-time load feedback from docker engine socket</p>
            </div>
            {latestMetrics?.timestamp && (
              <span className="text-[9px] font-mono text-zinc-550 bg-[#0B0D10]/50 border border-[rgba(255,255,255,0.04)] px-2 py-0.5 rounded">
                Tick: {new Date(latestMetrics.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>

          {systemMetrics.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-[10px] text-zinc-650 font-mono italic">
              Listening to host metrics stream...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={systemMetrics} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" />
                    <XAxis 
                      dataKey="timestamp" 
                      stroke="#27272a" 
                      fontSize={8} 
                      tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 
                    />
                    <YAxis stroke="#27272a" fontSize={8} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0B0D10', borderColor: 'rgba(255,255,255,0.08)', borderRadius: '6px' }}
                      itemStyle={{ fontSize: '10px', fontFamily: 'monospace', color: '#ffffff' }}
                    />
                    <Area type="monotone" dataKey="cpu" name="Host CPU (%)" stroke="#3b82f6" strokeWidth={1.5} fill="rgba(59, 130, 246, 0.04)" />
                    <Area type="monotone" dataKey="memory.percentage" name="Host RAM (%)" stroke="#a855f7" strokeWidth={1.5} fill="rgba(168, 85, 247, 0.04)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Memory readouts */}
              <div className="grid grid-cols-2 gap-4 font-mono text-[9px] text-zinc-550">
                <div className="p-2 bg-[#0B0D10] border border-white/[0.04] rounded-lg">
                  <span className="block text-[8px] uppercase tracking-wider font-bold">CPU Load Percentage</span>
                  <span className="text-zinc-300 font-bold block mt-1">{latestMetrics.cpu ?? 0}%</span>
                </div>
                <div className="p-2 bg-[#0B0D10] border border-white/[0.04] rounded-lg">
                  <span className="block text-[8px] uppercase tracking-wider font-bold">Memory RAM Load</span>
                  <span className="text-zinc-300 font-bold block mt-1">
                    {formatBytes(latestMetrics.memory?.used || 0)} / {formatBytes(latestMetrics.memory?.total || 0)} ({latestMetrics.memory?.percentage || 0}%)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Engine Specs */}
        <div className="lg:col-span-4 p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex flex-col justify-between shadow-sm">
          <div className="space-y-4 w-full text-xs">
            <div className="flex items-center gap-3 pb-3 border-b border-white/[0.04]">
              <div className="w-8 h-8 rounded-lg bg-[#0B0D10]/50 border border-[rgba(255,255,255,0.08)] flex items-center justify-center text-zinc-400">
                <Server size={14} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Engine Node Specs</h4>
                <p className="text-[8px] text-zinc-550 font-bold uppercase mt-0.5">Local daemon properties</p>
              </div>
            </div>

            <div className="space-y-1 font-sans">
              <div className="flex items-center justify-between py-2 border-b border-white/[0.03]">
                <span className="text-zinc-500 font-semibold text-[11px]">Docker version</span>
                <span className="font-bold text-zinc-300 font-mono text-[10px]">{summary?.dockerVersion || 'Unknown'}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/[0.03]">
                <span className="text-zinc-500 font-semibold text-[11px]">Operating System</span>
                <span className="font-bold text-zinc-300 text-[10px]">{summary?.operatingSystem || 'Unknown'}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/[0.03]">
                <span className="text-zinc-500 font-semibold text-[11px]">CPU Cores</span>
                <span className="font-bold text-zinc-300 font-mono text-[10px]">{summary?.ncpu || '0'} Cores</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-zinc-500 font-semibold text-[11px]">Physical Memory</span>
                <span className="font-bold text-zinc-300 font-mono text-[10px]">{formatBytes(summary?.memTotal || 0)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[9px] font-bold text-green-400 uppercase pt-4 border-t border-white/[0.04]">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Daemon Engine Active
          </div>
        </div>

      </div>

      {/* FEEDS LISTINGS: AUDIT LOGS VS SOCKET SIGNALS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Audited activities feed */}
        <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl space-y-4 shadow-sm flex flex-col justify-between h-[300px]">
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <History size={13} className="text-indigo-400" /> Audit Trail History
            </h3>
            <p className="text-[9px] text-zinc-500 font-medium">Logged user action logs stored in database</p>
          </div>

          <div className="flex-1 bg-[#0B0D10]/80 border border-[rgba(255,255,255,0.05)] rounded-xl p-4 overflow-y-auto min-h-0 space-y-3 font-mono text-[9px] shadow-inner no-scrollbar">
            {recentActivities.length === 0 ? (
              <div className="text-zinc-650 italic text-[10px] text-center py-6">No historical actions logged in audit trail yet.</div>
            ) : (
              recentActivities.map((act) => {
                const date = new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={act.id} className="flex justify-between items-start border-b border-white/[0.03] pb-2 last:border-0 last:pb-0 gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-1.5 py-0.5 border rounded uppercase text-[7px] font-bold font-mono shrink-0 ${getActionColor(act.action)}`}>
                          {act.action.replace('_INITIATED', '').replace('_SUCCESS', '')}
                        </span>
                        <span className="text-zinc-300 font-semibold">{act.details}</span>
                      </div>
                      {act.userEmail && (
                        <p className="text-zinc-550 text-[8px] mt-0.5 font-sans">Triggered by: {act.userEmail}</p>
                      )}
                    </div>
                    <span className="text-zinc-600 font-bold shrink-0">{date}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Real-time Docker socket signals */}
        <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl space-y-4 shadow-sm flex flex-col justify-between h-[300px]">
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Terminal size={13} className="text-pink-400" /> Docker Socket Events
            </h3>
            <p className="text-[9px] text-zinc-500 font-medium">Real-time syslog streams from docker.sock</p>
          </div>

          <div className="flex-1 bg-[#0B0D10]/80 border border-[rgba(255,255,255,0.05)] rounded-xl p-4 overflow-y-auto min-h-0 space-y-3 font-mono text-[9px] shadow-inner no-scrollbar">
            {liveEvents.length === 0 ? (
              <div className="text-zinc-650 italic text-[10px] text-center py-6">Waiting for Docker Engine events... Perform container actions to stream socket traffic.</div>
            ) : (
              liveEvents.map((evt, idx) => {
                const date = new Date(evt.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return (
                  <div key={idx} className="flex justify-between items-start border-b border-white/[0.03] pb-2 last:border-0 last:pb-0 gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-pink-400 font-bold uppercase text-[7px] tracking-wide">{evt.type}</span>
                        <span className="text-zinc-300 font-semibold">{evt.action}</span>
                      </div>
                      <p className="text-zinc-550 truncate text-[8px] mt-0.5" title={evt.actor.name || evt.actor.id}>
                        Target: {evt.actor.name || evt.actor.id.slice(0, 12)}
                      </p>
                    </div>
                    <span className="text-zinc-600 font-bold shrink-0">{date}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

    </motion.div>
  );
};

export default Dashboard;
