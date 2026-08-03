import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
  Network,
  Trash2,
  Plus,
  RefreshCw,
  Share2,
  Link as LinkIcon,
  Unlink,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

interface NetworkContainerInfo {
  Name: string;
  EndpointID: string;
  MacAddress: string;
  IPv4Address: string;
  IPv6Address: string;
}

interface NetworkItem {
  Id: string;
  Name: string;
  Driver: string;
  Scope: string;
  IPAM?: {
    Driver: string;
    Config?: { Subnet?: string; Gateway?: string }[];
  };
  Containers?: Record<string, NetworkContainerInfo>;
}

interface ContainerBrief {
  id: string;
  names: string[];
  state: string;
}

export const Networks: React.FC = () => {
  const queryClient = useQueryClient();

  // Selected Network state (for detail/visualizer inspection)
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(null);
  
  // Modals / Dropdown UI states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isConnectOpen, setIsConnectOpen] = useState<string | null>(null); // holds network ID
  const [formError, setFormError] = useState<string | null>(null);

  // Form states
  const [newNetworkName, setNewNetworkName] = useState('');
  const [networkDriver, setNetworkDriver] = useState('bridge');
  const [subnet, setSubnet] = useState('');
  const [gateway, setGateway] = useState('');
  const [connectContainerId, setConnectContainerId] = useState('');

  // Queries
  const { data: networks = [], isLoading, refetch } = useQuery<NetworkItem[]>({
    queryKey: ['networks'],
    queryFn: () => api.get('/networks'),
    refetchInterval: 12000,
  });

  const { data: containers = [] } = useQuery<ContainerBrief[]>({
    queryKey: ['containersBrief'],
    queryFn: () => api.get('/containers?all=true'),
  });

  const { data: inspectDetails, refetch: refetchDetails } = useQuery<NetworkItem>({
    queryKey: ['networkInspect', selectedNetworkId],
    queryFn: () => api.get(`/networks/${selectedNetworkId}`),
    enabled: !!selectedNetworkId,
    refetchInterval: !!selectedNetworkId ? 8000 : false,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (body: any) => api.post('/networks', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      setIsCreateOpen(false);
      setNewNetworkName('');
      setSubnet('');
      setGateway('');
      setFormError(null);
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to create network');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/networks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      if (selectedNetworkId === deleteMutation.variables) {
        setSelectedNetworkId(null);
      }
    },
    onError: (err: any) => {
      alert(`Delete failed: ${err.message}`);
    },
  });

  const connectMutation = useMutation({
    mutationFn: ({ networkId, containerId }: { networkId: string; containerId: string }) =>
      api.post(`/networks/${networkId}/connect`, { containerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      if (selectedNetworkId) refetchDetails();
      setIsConnectOpen(null);
      setConnectContainerId('');
    },
    onError: (err: any) => {
      alert(`Connection failed: ${err.message}`);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: ({ networkId, containerId }: { networkId: string; containerId: string }) =>
      api.post(`/networks/${networkId}/disconnect`, { containerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      if (selectedNetworkId) refetchDetails();
    },
    onError: (err: any) => {
      alert(`Disconnection failed: ${err.message}`);
    },
  });

  // Parse subnet and gateway from IPAM config
  const getIPAMDetails = (net: NetworkItem) => {
    const config = net.IPAM?.Config?.[0];
    if (!config) return { subnet: '—', gateway: '—' };
    return {
      subnet: config.Subnet || '—',
      gateway: config.Gateway || '—',
    };
  };

  // Helper to get number of connected containers
  const getContainerCount = (net: NetworkItem) => {
    return net.Containers ? Object.keys(net.Containers).length : 0;
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
            Networks Manager
          </h1>
          <p className="text-xs text-zinc-400 mt-2 font-medium">
            Manage virtual bridges, overlay configurations, and container port networking links.
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
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-950 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
          >
            <Plus size={14} />
            Create Network
          </button>
        </div>
      </div>

      {/* Main Panel grid: Visualizer mapping (top/right) & networks list (left) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Network Listing */}
        <div className={`space-y-4 ${selectedNetworkId ? 'lg:col-span-5' : 'lg:col-span-12'}`}>
          <div className="flex items-center justify-between text-xs text-zinc-550 pb-1">
            <span>DOCKER ENGINE INTERFACES</span>
            <span className="font-mono">{networks.length} Total</span>
          </div>

          {isLoading ? (
            <div className="h-60 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="space-y-3">
              {networks.map((net) => {
                const ipam = getIPAMDetails(net);
                const count = getContainerCount(net);
                const isSelected = selectedNetworkId === net.Id;

                return (
                  <motion.div
                    key={net.Id}
                    whileHover={{ y: -1 }}
                    onClick={() => setSelectedNetworkId(net.Id)}
                    className={`p-5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-4 ${
                      isSelected
                        ? 'bg-[#121418] border-indigo-500/40 shadow-md'
                        : 'bg-[#121418]/65 border-[rgba(255,255,255,0.06)] hover:border-zinc-700 shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 pr-4">
                        <h4 className="text-xs font-bold text-zinc-250 truncate">{net.Name}</h4>
                        <p className="text-[9px] font-mono text-zinc-550 truncate mt-1">ID: {net.Id.slice(0, 12)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-[#0B0D10]/50 border border-[rgba(255,255,255,0.04)] rounded text-[8px] font-mono font-bold text-zinc-400 uppercase tracking-wide">
                          {net.Driver}
                        </span>
                        <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/10 rounded text-[8px] font-mono font-bold text-indigo-400">
                          {count} Node{count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-[10px] border-t border-white/[0.04] pt-3">
                      <div>
                        <span className="text-zinc-550 font-semibold block text-[8px] uppercase tracking-wider">Subnet</span>
                        <span className="font-mono text-zinc-400 block mt-0.5">{ipam.subnet}</span>
                      </div>
                      <div>
                        <span className="text-zinc-550 font-semibold block text-[8px] uppercase tracking-wider">Gateway</span>
                        <span className="font-mono text-zinc-400 block mt-0.5">{ipam.gateway}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* INTERACTIVE RELATIONSHIP VISUALIZER MAP */}
        {selectedNetworkId && (
          <div className="lg:col-span-7 space-y-4">
            
            {/* Visualizer card */}
            <div className="p-6 bg-[#121418]/85 border border-indigo-500/25 rounded-xl shadow-md space-y-6">
              
              <div className="flex justify-between items-start border-b border-white/[0.04] pb-4">
                <div>
                  <h3 className="text-xs font-bold text-zinc-250 uppercase tracking-wider flex items-center gap-2">
                    <Share2 size={13} className="text-indigo-400" /> Interface Topology Graph
                  </h3>
                  <p className="text-[9px] text-zinc-500 font-medium mt-1">Real-time container IP allocations inside this network</p>
                </div>
                
                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsConnectOpen(selectedNetworkId)}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-zinc-200 text-zinc-950 rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                  >
                    <LinkIcon size={10} /> Connect Node
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete network "${inspectDetails?.Name}"?`)) {
                        deleteMutation.mutate(selectedNetworkId);
                      }
                    }}
                    className="p-1 border border-red-500/20 hover:border-red-500/40 bg-red-500/5 text-red-400 rounded-lg hover:bg-red-500/10 transition-all cursor-pointer"
                    title="Delete network"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Dynamic Diagram */}
              {inspectDetails ? (
                <div className="flex flex-col md:flex-row items-center gap-8 justify-center py-6 relative">
                  
                  {/* Central Network Hub Node */}
                  <div className="w-28 h-28 rounded-full bg-[#0B0D10] border border-indigo-500/30 flex flex-col items-center justify-center relative shrink-0 shadow-lg select-none">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-1.5 animate-pulse">
                      <Network size={18} />
                    </div>
                    <span className="text-[10px] font-extrabold text-white truncate max-w-[90px]" title={inspectDetails.Name}>
                      {inspectDetails.Name}
                    </span>
                    <span className="text-[8px] text-zinc-550 uppercase font-mono tracking-wider font-bold mt-0.5">{inspectDetails.Driver}</span>
                  </div>

                  {/* Connected Container Nodes List */}
                  <div className="flex-1 w-full space-y-4 max-h-[300px] overflow-y-auto pr-1">
                    {!inspectDetails.Containers || Object.keys(inspectDetails.Containers).length === 0 ? (
                      <div className="text-center py-10 border border-dashed border-white/[0.04] rounded-xl text-zinc-550 text-[11px]">
                        No containers attached to this network.
                      </div>
                    ) : (
                      Object.entries(inspectDetails.Containers).map(([id, info]) => {
                        const shortId = id.slice(0, 12);
                        return (
                          <div
                            key={id}
                            className="p-3 bg-[#0B0D10]/80 border border-white/[0.04] hover:border-zinc-750 rounded-xl flex items-center justify-between transition-colors group relative"
                          >
                            <div className="min-w-0 pr-4 flex items-center gap-3">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></div>
                              <div className="min-w-0">
                                <Link
                                  to={`/containers/${id}`}
                                  className="text-xs font-bold text-zinc-300 hover:text-indigo-400 transition-colors block truncate"
                                  title="Inspect container details"
                                >
                                  {info.Name || shortId}
                                </Link>
                                <span className="font-mono text-[9px] text-zinc-550 block mt-0.5">IP: {info.IPv4Address || '—'}</span>
                              </div>
                            </div>

                            <button
                              onClick={() => disconnectMutation.mutate({ networkId: selectedNetworkId, containerId: id })}
                              disabled={disconnectMutation.isPending}
                              className="p-1 hover:bg-red-500/10 text-zinc-555 hover:text-red-400 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                              title="Disconnect container from network"
                            >
                              <Unlink size={11} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                </div>
              ) : (
                <div className="h-44 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-zinc-700 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>

      {/* CREATE MODAL */}
      <AnimatePresence>
        {isCreateOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateOpen(false)}
              className="absolute inset-0 bg-black"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-md p-6 bg-[#121418] border border-[rgba(255,255,255,0.08)] rounded-2xl shadow-2xl relative text-white space-y-4"
            >
              <h3 className="text-sm font-bold text-zinc-200">Create Docker Network</h3>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Network Name</label>
                  <input
                    type="text"
                    value={newNetworkName}
                    onChange={(e) => setNewNetworkName(e.target.value)}
                    placeholder="e.g. app_network"
                    className="w-full px-4 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-zinc-350 focus:outline-none focus:border-zinc-700"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Driver Type</label>
                  <select
                    value={networkDriver}
                    onChange={(e) => setNetworkDriver(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-zinc-350 focus:outline-none focus:border-zinc-700"
                  >
                    <option value="bridge">bridge (Default)</option>
                    <option value="overlay">overlay (Swarm)</option>
                    <option value="host">host</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Subnet (Optional)</label>
                    <input
                      type="text"
                      value={subnet}
                      onChange={(e) => setSubnet(e.target.value)}
                      placeholder="e.g. 172.28.0.0/16"
                      className="w-full px-4 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-zinc-350 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Gateway (Optional)</label>
                    <input
                      type="text"
                      value={gateway}
                      onChange={(e) => setGateway(e.target.value)}
                      placeholder="e.g. 172.28.0.1"
                      className="w-full px-4 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-zinc-350 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
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
                  onClick={() => createMutation.mutate({ name: newNetworkName, driver: networkDriver, subnet, gateway })}
                  disabled={createMutation.isPending || !newNetworkName}
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-950 disabled:bg-zinc-900 disabled:text-zinc-550 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Create
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONNECT CONTAINER MODAL */}
      <AnimatePresence>
        {isConnectOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsConnectOpen(null)}
              className="absolute inset-0 bg-black"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-md p-6 bg-[#121418] border border-[rgba(255,255,255,0.08)] rounded-2xl shadow-2xl relative text-white space-y-4"
            >
              <h3 className="text-sm font-bold text-zinc-200 font-sans">Connect Container Node</h3>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Target Node</label>
                  <select
                    value={connectContainerId}
                    onChange={(e) => setConnectContainerId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-zinc-350 focus:outline-none focus:border-zinc-700"
                  >
                    <option value="">-- Choose Container --</option>
                    {containers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.names[0]?.replace(/^\//, '') || c.id.slice(0, 12)} ({c.state})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.04]">
                <button
                  onClick={() => setIsConnectOpen(null)}
                  className="px-4 py-2 border border-[rgba(255,255,255,0.08)] bg-transparent hover:bg-white/5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => connectMutation.mutate({ networkId: isConnectOpen, containerId: connectContainerId })}
                  disabled={connectMutation.isPending || !connectContainerId}
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-950 disabled:bg-zinc-900 disabled:text-zinc-550 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Connect
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};
export default Networks;
