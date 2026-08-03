import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
  HardDrive,
  Trash2,
  Plus,
  RefreshCw,
  Copy,
  Info,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

interface VolumeItem {
  name: string;
  driver: string;
  mountpoint: string;
  createdAt: string;
  status: any;
  containers: { id: string; name: string }[];
}

export const Volumes: React.FC = () => {
  const queryClient = useQueryClient();

  // Dialog / Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [inspectVolume, setInspectVolume] = useState<VolumeItem | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Form states
  const [newVolumeName, setNewVolumeName] = useState('');
  const [volumeDriver, setVolumeDriver] = useState('local');
  const [formError, setFormError] = useState<string | null>(null);

  // Queries
  const { data: volumes = [], isLoading, refetch } = useQuery<VolumeItem[]>({
    queryKey: ['volumes'],
    queryFn: () => api.get('/volumes'),
    refetchInterval: 12000,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (body: { name: string; driver: string }) => api.post('/volumes', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volumes'] });
      setIsCreateOpen(false);
      setNewVolumeName('');
      setFormError(null);
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to create volume');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.delete(`/volumes/${name}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volumes'] });
      setInspectVolume(null);
    },
    onError: (err: any) => {
      alert(`Delete failed: ${err.message}`);
    },
  });

  const pruneMutation = useMutation({
    mutationFn: () => api.post('/volumes/prune'),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['volumes'] });
      const deletedCount = data.volumesDeleted?.length || 0;
      alert(`Pruned successfully! Deleted ${deletedCount} unused volumes.`);
    },
    onError: (err: any) => {
      alert(`Prune failed: ${err.message}`);
    },
  });

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.3 }}
      className="space-y-8 max-w-6xl mx-auto font-sans p-6 text-white"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-4 border-b border-[rgba(255,255,255,0.06)]">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white leading-none">
            Volumes Manager
          </h1>
          <p className="text-xs text-zinc-400 mt-2 font-medium">
            Manage persistent storage volumes bound to your container filesystems.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => refetch()}
            className="p-2 border border-[rgba(255,255,255,0.08)] hover:border-zinc-700 bg-[#121418] rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => {
              if (confirm('Are you sure you want to prune all unused volumes? This will delete all local volumes that are not attached to any container.')) {
                pruneMutation.mutate();
              }
            }}
            disabled={pruneMutation.isPending}
            className="px-4 py-2 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 text-red-400 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            Prune Unused
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-950 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
          >
            <Plus size={14} />
            Create Volume
          </button>
        </div>
      </div>

      {/* Volumes table */}
      {isLoading ? (
        <div className="h-60 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : volumes.length === 0 ? (
        <div className="border border-[rgba(255,255,255,0.08)] border-dashed rounded-xl p-16 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
          <HardDrive size={32} className="text-zinc-650" />
          <p className="text-sm font-semibold text-zinc-400">No volumes detected.</p>
          <p className="text-xs text-zinc-650 max-w-sm leading-relaxed">
            Volumes store container state persistently. When you run containers like database nodes, mount their directories onto named volumes to keep data between restarts.
          </p>
        </div>
      ) : (
        <div className="bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#0B0D10]/50 text-zinc-450 uppercase tracking-wider text-[9px] border-b border-[rgba(255,255,255,0.06)] font-bold">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Driver</th>
                  <th className="px-6 py-4">Mountpoint</th>
                  <th className="px-6 py-4">Connected Nodes</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-zinc-300">
                {volumes.map((vol) => (
                  <tr key={vol.name} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-bold text-zinc-200 block truncate max-w-[200px]" title={vol.name}>
                        {vol.name}
                      </span>
                      {vol.createdAt && (
                        <span className="text-[9px] text-zinc-550 block mt-0.5">
                          Created {new Date(vol.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-zinc-450">{vol.driver}</td>
                    <td className="px-6 py-4 max-w-[280px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-zinc-500 truncate" title={vol.mountpoint}>
                          {vol.mountpoint}
                        </span>
                        <button
                          onClick={() => handleCopyPath(vol.mountpoint)}
                          className="p-1 hover:bg-zinc-800 text-zinc-555 hover:text-white rounded transition-colors cursor-pointer"
                          title="Copy mountpoint path"
                        >
                          {copiedPath === vol.mountpoint ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {vol.containers.length === 0 ? (
                        <span className="text-zinc-600 font-mono text-[10px]">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {vol.containers.map((c) => (
                            <Link
                              key={c.id}
                              to={`/containers/${c.id}`}
                              className="px-2 py-0.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold"
                            >
                              {c.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2.5">
                        <button
                          onClick={() => setInspectVolume(vol)}
                          className="p-1.5 hover:bg-zinc-900/50 text-zinc-500 hover:text-zinc-300 rounded-lg cursor-pointer transition-colors"
                          title="Inspect raw details"
                        >
                          <Info size={13} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete volume "${vol.name}"?`)) {
                              deleteMutation.mutate(vol.name);
                            }
                          }}
                          className="p-1.5 hover:bg-zinc-900/50 text-zinc-500 hover:text-red-400 rounded-lg cursor-pointer transition-colors"
                          title="Delete volume"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      <AnimatePresence>
        {isCreateOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateOpen(false)}
              className="absolute inset-0 bg-black"
            />
            {/* Dialog Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-md p-6 bg-[#121418] border border-[rgba(255,255,255,0.08)] rounded-2xl shadow-2xl relative text-white space-y-4"
            >
              <h3 className="text-sm font-bold text-zinc-200">Create Docker Volume</h3>
              
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Volume Name</label>
                  <input
                    type="text"
                    value={newVolumeName}
                    onChange={(e) => setNewVolumeName(e.target.value)}
                    placeholder="e.g. redis_data"
                    className="w-full px-4 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-zinc-350 focus:outline-none focus:border-zinc-700"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Driver Type</label>
                  <select
                    value={volumeDriver}
                    onChange={(e) => setVolumeDriver(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-zinc-350 focus:outline-none focus:border-zinc-700"
                  >
                    <option value="local">local (Default)</option>
                  </select>
                </div>
              </div>

              {formError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-2.5 text-red-400 text-xs">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.04]">
                <button
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-[rgba(255,255,255,0.08)] bg-transparent hover:bg-white/5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createMutation.mutate({ name: newVolumeName, driver: volumeDriver })}
                  disabled={createMutation.isPending || !newVolumeName}
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-950 disabled:bg-zinc-900 disabled:text-zinc-500 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Create
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* INSPECT MODAL */}
      <AnimatePresence>
        {inspectVolume && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setInspectVolume(null)}
              className="absolute inset-0 bg-black"
            />
            {/* Dialog Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-2xl p-6 bg-[#121418] border border-[rgba(255,255,255,0.08)] rounded-2xl shadow-2xl relative text-white space-y-4"
            >
              <h3 className="text-sm font-bold text-zinc-250 truncate pr-8">Inspect Volume: {inspectVolume.name}</h3>

              <pre className="p-4 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-[10px] font-mono text-zinc-400 overflow-auto max-h-[300px]">
                {JSON.stringify(inspectVolume, null, 2)}
              </pre>

              <div className="flex justify-end pt-2 border-t border-white/[0.04]">
                <button
                  onClick={() => setInspectVolume(null)}
                  className="px-5 py-2 bg-white hover:bg-zinc-200 text-zinc-950 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
export default Volumes;
