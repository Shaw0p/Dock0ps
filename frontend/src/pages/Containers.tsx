import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  Play,
  Square,
  RotateCw,
  Trash2,
  Copy,
  Plus,
  RefreshCw,
  Boxes,
  Terminal,
  ChevronRight
} from 'lucide-react';
import { motion } from 'framer-motion';
import CreateContainerWizard from '../components/CreateContainerWizard';

interface Container {
  id: string;
  names: string[];
  image: string;
  state: string;
  status: string;
  ports: { PublicPort: number; PrivatePort: number; Type: string }[];
  created: number;
}

export const Containers: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [hoveredCliCommand, setHoveredCliCommand] = useState<string>('docker ps -a');

  // Fetch containers
  const { data: containers = [], isLoading, refetch } = useQuery<Container[]>({
    queryKey: ['containersList'],
    queryFn: async () => {
      const res = await api.get('/containers');
      return res || [];
    },
    refetchInterval: 6000,
  });

  // Action mutation
  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'start' | 'stop' | 'restart' | 'delete' | 'duplicate' }) => {
      if (action === 'delete') {
        await api.delete(`/containers/${id}?force=true`);
        return { action };
      }
      if (action === 'duplicate') {
        const res = await api.post(`/containers/duplicate/${id}`);
        return { action, duplicateId: res.duplicateId };
      }
      const res = await api.patch(`/containers/${action}/${id}`);
      return res;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['containersList'] });
      queryClient.invalidateQueries({ queryKey: ['systemSummary'] });
      if (data.action === 'duplicate' && data.duplicateId) {
        navigate(`/containers/${data.duplicateId}`);
      }
    },
  });

  const getContainerName = (c: Container) => {
    return c.names[0]?.replace(/^\//, '') || c.id.slice(0, 12);
  };

  const getPortMappings = (c: Container) => {
    if (!c.ports || c.ports.length === 0) return '';
    return c.ports
      .filter((p) => p.PublicPort)
      .map((p) => `${p.PublicPort}:${p.PrivatePort}`)
      .join(', ');
  };

  const getCLICommand = (c: Container, action: string) => {
    const shortId = c.id.slice(0, 12);
    switch (action) {
      case 'start': return `docker start ${shortId}`;
      case 'stop': return `docker stop ${shortId}`;
      case 'restart': return `docker restart ${shortId}`;
      case 'delete': return `docker rm -f ${shortId}`;
      case 'duplicate': return `docker run -d --name ${getContainerName(c)}-copy --network bridge ${c.image}`;
      default: return `docker inspect ${shortId}`;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-6xl mx-auto font-sans p-6 text-white"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-4 border-b border-[rgba(255,255,255,0.06)]">
        <div className="space-y-1">
          <h1 className="text-2xl font-black tracking-tight text-white leading-tight">
            Container Nodes
          </h1>
          <p className="text-sm text-zinc-400 font-medium">
            Deploy, coordinate, and inspect container nodes active on the daemon host.
          </p>
        </div>
        
        <div className="flex items-center gap-3 self-start sm:self-center">
          <button
            onClick={() => refetch()}
            className="p-2 border border-[rgba(255,255,255,0.08)] hover:border-zinc-700 bg-[#121418] hover:bg-[#181a20] rounded-xl text-zinc-300 hover:text-white transition-all cursor-pointer shadow-sm"
            title="Sync State"
          >
            <RefreshCw size={13} />
          </button>
          
          <button
            onClick={() => setIsWizardOpen(true)}
            onMouseEnter={() => setHoveredCliCommand('docker run -d ...')}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#0db7ed] hover:bg-[#0aa6d8] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm shadow-[#0db7ed]/10"
          >
            <Plus size={13} /> Create Container
          </button>
        </div>
      </div>

      {/* Orchestrator CLI Transparency panel */}
      <div className="bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-[#0db7ed]" />
          <div>
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-zinc-550 block">Orchestrator CLI Transparency</span>
            <span className="text-[10px] text-zinc-400 font-medium font-sans">Hover operations below to view corresponding Docker CLI commands</span>
          </div>
        </div>
        <div className="flex-1 max-w-xl">
          <pre className="text-[9px] font-mono text-zinc-300 bg-[#0B0D10] border border-white/[0.04] p-2.5 px-4 rounded-lg overflow-x-auto whitespace-pre no-scrollbar">
            {hoveredCliCommand}
          </pre>
        </div>
      </div>

      {/* Main List */}
      <div className="min-h-[400px]">
        {isLoading ? (
          <div className="h-44 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-zinc-700 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : containers.length === 0 ? (
          <div className="border border-[rgba(255,255,255,0.08)] border-dashed rounded-xl p-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
            <Boxes size={28} className="text-zinc-750" />
            <p className="text-xs font-semibold text-zinc-400">No container nodes deployed on host.</p>
            <p className="text-[10px] text-zinc-650 max-w-xs leading-relaxed">Launch containers using the wizard or pull repository images.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {containers.map((c) => {
              const name = getContainerName(c);
              const isRunning = c.state === 'running';
              const ports = getPortMappings(c);

              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/containers/${c.id}`)}
                  className="p-4 px-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] hover:border-zinc-750 rounded-xl flex items-center justify-between transition-all cursor-pointer group shadow-sm"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {/* Status indicator */}
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? 'bg-green-500' : 'bg-zinc-600'}`}></span>
                    
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-zinc-200 truncate group-hover:text-white">{name}</h4>
                        <span className="text-[10px] text-zinc-500 font-mono">({c.id.slice(0, 8)})</span>
                      </div>
                      <p className="text-[10px] text-zinc-550 font-mono truncate mt-0.5" title={c.image}>
                        {c.image.replace(/^sha256:/, '')}
                      </p>
                    </div>
                  </div>

                  {/* Ports column */}
                  <div className="hidden sm:block text-center px-4">
                    {ports ? (
                      <span className="px-2.5 py-1 bg-[#0B0D10]/50 border border-[rgba(255,255,255,0.06)] rounded-lg font-mono text-[9px] text-zinc-300">
                        {ports}
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-[10px] font-mono">—</span>
                    )}
                  </div>

                  {/* Status & Quick Actions */}
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-[10px] text-zinc-450 font-bold text-right hidden md:block">
                      {c.status}
                    </span>

                    {/* Quick action triggers */}
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {isRunning ? (
                        <button
                          onClick={() => actionMutation.mutate({ id: c.id, action: 'stop' })}
                          onMouseEnter={() => setHoveredCliCommand(getCLICommand(c, 'stop'))}
                          className="p-1.5 hover:bg-zinc-900/50 text-zinc-550 hover:text-red-400 rounded-lg cursor-pointer transition-colors"
                          title="Stop"
                        >
                          <Square size={12} />
                        </button>
                      ) : (
                        <button
                          onClick={() => actionMutation.mutate({ id: c.id, action: 'start' })}
                          onMouseEnter={() => setHoveredCliCommand(getCLICommand(c, 'start'))}
                          className="p-1.5 hover:bg-zinc-900/50 text-zinc-555 hover:text-green-400 rounded-lg cursor-pointer transition-colors"
                          title="Start"
                        >
                          <Play size={12} />
                        </button>
                      )}
                      <button
                        onClick={() => actionMutation.mutate({ id: c.id, action: 'restart' })}
                        onMouseEnter={() => setHoveredCliCommand(getCLICommand(c, 'restart'))}
                        className="p-1.5 hover:bg-zinc-900/50 text-zinc-555 hover:text-white rounded-lg cursor-pointer transition-colors"
                        title="Restart"
                      >
                        <RotateCw size={12} />
                      </button>
                      <button
                        onClick={() => actionMutation.mutate({ id: c.id, action: 'duplicate' })}
                        onMouseEnter={() => setHoveredCliCommand(getCLICommand(c, 'duplicate'))}
                        className="p-1.5 hover:bg-zinc-900/50 text-zinc-555 hover:text-white rounded-lg cursor-pointer transition-colors"
                        title="Duplicate"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete container node ${name}?`)) {
                            actionMutation.mutate({ id: c.id, action: 'delete' });
                          }
                        }}
                        onMouseEnter={() => setHoveredCliCommand(getCLICommand(c, 'delete'))}
                        className="p-1.5 hover:bg-zinc-900/50 text-zinc-555 hover:text-red-400 rounded-lg cursor-pointer transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <ChevronRight size={14} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Creation Wizard */}
      <CreateContainerWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={(newId) => {
          setIsWizardOpen(false);
          navigate(`/containers/${newId}`);
        }}
      />
    </motion.div>
  );
};
export default Containers;
