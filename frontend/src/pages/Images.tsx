import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import {
  Download,
  Trash2,
  Tag,
  Search,
  RefreshCw,
  Globe,
  KeyRound,
  ShieldCheck,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageItem {
  id: string;
  repoTags: string[];
  size: number;
  created: number;
  containers: number;
}

interface HubSearchResult {
  name: string;
  description: string;
  is_official: boolean;
  star_count: number;
}

interface PullProgressItem {
  id: string;
  status: string;
  progress: string;
  progressDetail?: { current: number; total: number };
}

interface RegistryItem {
  id: string;
  name: string;
  url: string;
  username: string;
  createdAt: string;
}

export const Images: React.FC = () => {
  const queryClient = useQueryClient();
  const socket = useSocket();

  // Tabs: 'local' | 'search' | 'registries'
  const [activeTab, setActiveTab] = useState<'local' | 'search' | 'registries'>('local');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Search States
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<HubSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Pull States
  const [pullImageName, setPullImageName] = useState('');
  const [isPulling, setIsPulling] = useState(false);
  const [pullStatus, setPullStatus] = useState('');
  const [pullProgress, setPullProgress] = useState<Record<string, PullProgressItem>>({});

  // Tag States
  const [tagId, setTagId] = useState<string | null>(null);
  const [tagRepo, setTagRepo] = useState('');
  const [tagTag, setTagTag] = useState('latest');

  // Registry Form States
  const [regName, setRegName] = useState('');
  const [regUrl, setRegUrl] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regError, setRegError] = useState<string | null>(null);

  // Queries
  const { data: images = [], isLoading: isImagesLoading, refetch: refetchImages } = useQuery<ImageItem[]>({
    queryKey: ['images'],
    queryFn: () => api.get('/images'),
    refetchInterval: 12000,
  });

  const { data: inspectDetails } = useQuery({
    queryKey: ['imageInspect', selectedId],
    queryFn: () => api.get(`/images/${selectedId}`),
    enabled: !!selectedId,
  });

  const { data: registries = [], isLoading: isRegLoading, refetch: refetchRegistries } = useQuery<RegistryItem[]>({
    queryKey: ['registries'],
    queryFn: () => api.get('/registries'),
    enabled: activeTab === 'registries',
  });

  // Socket pull connection
  useEffect(() => {
    if (!socket) return;

    const handleProgress = (data: any) => {
      setIsPulling(true);
      setPullStatus(`Downloading ${data.imageName}...`);
      if (data.id) {
        setPullProgress((prev) => ({
          ...prev,
          [data.id]: {
            id: data.id,
            status: data.status,
            progress: data.progress || '',
            progressDetail: data.progressDetail,
          },
        }));
      }
    };

    const handleStatus = (data: any) => {
      if (data.status === 'completed') {
        setPullStatus('Pull completed.');
        setPullProgress({});
        setTimeout(() => {
          setIsPulling(false);
          setPullStatus('');
        }, 2000);
        queryClient.invalidateQueries({ queryKey: ['images'] });
        queryClient.invalidateQueries({ queryKey: ['systemSummary'] });
      } else if (data.status === 'error') {
        setPullStatus(`Failed: ${data.error}`);
        setTimeout(() => setIsPulling(false), 4000);
      }
    };

    socket.on('pull-progress', handleProgress);
    socket.on('pull-status', handleStatus);

    return () => {
      socket.off('pull-progress', handleProgress);
      socket.off('pull-status', handleStatus);
    };
  }, [socket, queryClient]);

  // Image Mutations
  const pullMutation = useMutation({
    mutationFn: (imageName: string) => {
      setPullProgress({});
      setIsPulling(true);
      setPullStatus(`Pulling ${imageName}...`);
      return api.post('/images/pull', { imageName, socketId: socket?.id });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) =>
      api.delete(`/images/${id}?force=${force}`),
    onSuccess: () => {
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['images'] });
      queryClient.invalidateQueries({ queryKey: ['systemSummary'] });
    },
  });

  const tagMutation = useMutation({
    mutationFn: (body: { id: string; repo: string; tag: string }) =>
      api.post('/images/tag', body),
    onSuccess: () => {
      setTagId(null);
      queryClient.invalidateQueries({ queryKey: ['images'] });
    },
  });

  // Registry Mutations
  const saveRegMutation = useMutation({
    mutationFn: (body: any) => api.post('/registries', body),
    onSuccess: () => {
      refetchRegistries();
      setRegName('');
      setRegUrl('');
      setRegUser('');
      setRegPass('');
      setRegError(null);
    },
    onError: (err: any) => {
      setRegError(err.message || 'Failed to save credentials');
    },
  });

  const deleteRegMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/registries/${id}`),
    onSuccess: () => {
      refetchRegistries();
    },
  });

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm) return;
    setIsSearching(true);
    try {
      const results = await api.get(`/images/search?term=${encodeURIComponent(searchTerm)}`);
      setSearchResults(results);
    } catch (err) {
      alert('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    return mb.toFixed(2) + ' MB';
  };

  const cleanImageId = (id: string) => {
    return id.replace(/^sha256:/, '').slice(0, 12);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.3 }}
      className="space-y-8 max-w-6xl mx-auto font-sans p-6 text-white"
    >
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-2 border-b border-[rgba(255,255,255,0.06)]">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white leading-none">
            Images & Registries
          </h1>
          <p className="text-xs text-zinc-400 mt-2 font-medium">
            Search Docker Hub, manage custom registries, and pull container images locally.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[rgba(255,255,255,0.06)]">
        <button
          onClick={() => setActiveTab('local')}
          className={`px-5 py-2 text-xs font-bold tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'local'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-350'
          }`}
        >
          <Layers size={12} /> Local Images
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`px-5 py-2 text-xs font-bold tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'search'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-350'
          }`}
        >
          <Search size={12} /> Search Docker Hub
        </button>
        <button
          onClick={() => setActiveTab('registries')}
          className={`px-5 py-2 text-xs font-bold tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'registries'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-350'
          }`}
        >
          <KeyRound size={12} /> Registry Credentials
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* LOCAL IMAGES TAB */}
        {activeTab === 'local' && (
          <motion.div
            key="local"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Pull Image Top bar */}
            <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl space-y-4 shadow-sm">
              <h3 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-2">
                <Download size={14} className="text-indigo-400" /> Pull Registry Image
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pullImageName) pullMutation.mutate(pullImageName);
                }}
                className="flex gap-3"
              >
                <input
                  type="text"
                  value={pullImageName}
                  onChange={(e) => setPullImageName(e.target.value)}
                  placeholder="e.g. redis:alpine, ghcr.io/my-org/web:latest"
                  disabled={isPulling}
                  className="flex-1 px-4 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs placeholder-zinc-700 focus:outline-none focus:border-zinc-700 text-zinc-350"
                />
                <button
                  type="submit"
                  disabled={isPulling || !pullImageName}
                  className="px-5 py-2 bg-white hover:bg-zinc-200 disabled:bg-zinc-900 text-zinc-950 disabled:text-zinc-550 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  Pull Image
                </button>
              </form>

              {/* Layer Pull Progress Indicator */}
              {isPulling && (
                <div className="p-4 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl space-y-3 max-h-56 overflow-y-auto font-mono text-[10px] text-zinc-500 shadow-inner">
                  <p className="text-zinc-300 font-semibold">{pullStatus}</p>
                  {Object.values(pullProgress).map((layer) => (
                    <div key={layer.id} className="space-y-1">
                      <div className="flex justify-between">
                        <span>{layer.id || 'Layer'}</span>
                        <span className="font-bold">{layer.status} {layer.progress || ''}</span>
                      </div>
                      {layer.progressDetail && layer.progressDetail.total > 0 && (
                        <div className="w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-indigo-500 h-full rounded-full"
                            style={{
                              width: `${(layer.progressDetail.current / layer.progressDetail.total) * 100}%`,
                            }}
                          ></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Images Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
              
              {/* Image list */}
              <div className={`flex flex-col gap-4 ${selectedId ? 'xl:col-span-7' : 'xl:col-span-12'}`}>
                <div className="flex items-center justify-between text-xs text-zinc-550 pb-1">
                  <span>LOCAL IMAGE LAYERS</span>
                  <button
                    onClick={() => refetchImages()}
                    className="p-1.5 border border-[rgba(255,255,255,0.08)] hover:border-zinc-700 bg-[#121418] rounded-lg text-zinc-400 hover:text-white transition-all cursor-pointer"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>

                {isImagesLoading ? (
                  <div className="h-44 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-zinc-700 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : images.length === 0 ? (
                  <div className="border border-[rgba(255,255,255,0.08)] border-dashed rounded-xl p-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
                    <Layers size={24} className="text-zinc-750" />
                    <p className="text-xs">No images loaded inside host daemon.</p>
                  </div>
                ) : (
                  <div className="border border-[rgba(255,255,255,0.06)] bg-[#121418]/65 rounded-xl divide-y divide-white/[0.04] shadow-sm">
                    {images.map((img) => (
                      <div
                        key={img.id}
                        onClick={() => setSelectedId(img.id)}
                        className={`flex items-center justify-between p-4 px-5 cursor-pointer transition-all ${
                          selectedId === img.id
                            ? 'bg-zinc-900/35 border-l-2 border-indigo-500'
                            : 'hover:bg-zinc-900/20'
                        }`}
                      >
                        <div className="min-w-0 pr-3">
                          <h4 className="text-xs font-bold text-zinc-250 truncate">
                            {img.repoTags[0] || '<none>:<none>'}
                          </h4>
                          <div className="flex items-center gap-3 text-[10px] text-zinc-550 mt-1 font-mono">
                            <span>ID: {cleanImageId(img.id)}</span>
                            <span>•</span>
                            <span>{formatSize(img.size)}</span>
                            {img.containers > 0 && (
                              <span className="text-green-400 font-semibold">{img.containers} active</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setTagId(img.id);
                              setTagRepo(img.repoTags[0]?.split(':')[0] || 'repository');
                            }}
                            className="p-1.5 hover:bg-zinc-900 text-zinc-500 hover:text-white rounded-lg transition-colors cursor-pointer"
                            title="Tag Image"
                          >
                            <Tag size={13} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Remove image ${img.repoTags[0] || cleanImageId(img.id)}?`)) {
                                deleteMutation.mutate({ id: img.id, force: true });
                              }
                            }}
                            className="p-1.5 hover:bg-zinc-900 text-zinc-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                            title="Delete Image"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Inspect Details */}
              {selectedId && (
                <div className="xl:col-span-5 border border-[rgba(255,255,255,0.08)] bg-[#121418]/65 rounded-xl overflow-hidden flex flex-col h-full max-h-[450px] shadow-sm">
                  <div className="p-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-zinc-350 uppercase tracking-wider">Image Specifications</h3>
                      <span className="text-[9px] text-zinc-550 block mt-0.5 font-mono">{cleanImageId(selectedId)}</span>
                    </div>
                    <button
                      onClick={() => setSelectedId(null)}
                      className="text-[9px] font-bold px-2.5 py-1 border border-[rgba(255,255,255,0.08)] hover:border-zinc-750 text-zinc-400 hover:text-white bg-transparent rounded-lg cursor-pointer transition-colors"
                    >
                      Close
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs min-h-0">
                    {inspectDetails ? (
                      <>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="p-3 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-lg">
                            <span className="text-zinc-550 font-semibold block">Virtual Size</span>
                            <p className="text-zinc-300 font-bold mt-1 font-mono">{formatSize(inspectDetails.VirtualSize)}</p>
                          </div>
                          <div className="p-3 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-lg">
                            <span className="text-zinc-555 font-semibold block">Architecture</span>
                            <p className="text-zinc-300 font-bold mt-1 capitalize">{inspectDetails.Architecture} / {inspectDetails.Os}</p>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-zinc-500 font-semibold block">Default Cmd</span>
                          <code className="block p-2.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] text-zinc-300 rounded-lg font-mono break-all max-h-20 overflow-y-auto leading-relaxed">
                            {(inspectDetails.Config?.Cmd || []).join(' ')}
                          </code>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-zinc-500 font-semibold block font-mono">FS Layers: {(inspectDetails.RootFS?.Layers || []).length}</span>
                          <div className="border border-[rgba(255,255,255,0.08)] rounded-xl divide-y divide-[rgba(255,255,255,0.05)] max-h-28 overflow-y-auto bg-[#0B0D10] p-3 font-mono text-[9px]">
                            {(inspectDetails.RootFS?.Layers || []).map((layer: string, idx: number) => (
                              <div key={idx} className="py-1 text-zinc-500 truncate" title={layer}>
                                {layer.replace(/^sha256:/, '')}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-24 items-center justify-center text-zinc-650 font-mono text-[10px]">
                        Extracting details...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* SEARCH DOCKER HUB TAB */}
        {activeTab === 'search' && (
          <motion.div
            key="search"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl space-y-4 shadow-sm">
              <h3 className="text-xs font-bold text-zinc-355 uppercase tracking-wider flex items-center gap-2">
                <Search size={14} className="text-indigo-400" /> Query Registry Registry Catalog
              </h3>
              <form onSubmit={handleSearch} className="flex gap-3">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="e.g. alpine, postgres, node"
                  className="flex-1 px-4 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs placeholder-zinc-700 focus:outline-none focus:border-zinc-700 text-zinc-300"
                />
                <button
                  type="submit"
                  disabled={isSearching || !searchTerm}
                  className="px-5 py-2 bg-white hover:bg-zinc-200 disabled:bg-zinc-900 text-zinc-950 disabled:text-zinc-550 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </form>
            </div>

            {searchResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {searchResults.map((res) => (
                  <div
                    key={res.name}
                    className="p-5 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex items-center justify-between gap-6"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-200 text-xs truncate">{res.name}</span>
                        {res.is_official && (
                          <span className="px-1.5 py-0.5 bg-green-500/10 border border-green-500/20 text-green-400 text-[8px] font-bold rounded uppercase">Official</span>
                        )}
                      </div>
                      <p className="text-zinc-500 text-[10px] mt-1.5 line-clamp-2" title={res.description}>{res.description || 'No description provided.'}</p>
                    </div>

                    <button
                      onClick={() => {
                        setPullImageName(res.name);
                        setActiveTab('local');
                        pullMutation.mutate(res.name);
                      }}
                      className="px-4 py-2 bg-[#0B0D10] hover:bg-zinc-900 border border-[rgba(255,255,255,0.06)] text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm shrink-0"
                    >
                      Pull
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* REGISTRY CREDENTIALS TAB */}
        {activeTab === 'registries' && (
          <motion.div
            key="registries"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Form Column */}
            <div className="space-y-6">
              <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl space-y-4 shadow-sm">
                <h3 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-2">
                  <Globe size={14} className="text-indigo-400" /> Registry Parameters
                </h3>

                <div className="space-y-3 font-semibold text-xs">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider block">Registry Title</label>
                    <input
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="e.g. GitHub Packages (GHCR)"
                      className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-zinc-700 text-zinc-300"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider block">Registry URL</label>
                    <input
                      type="text"
                      value={regUrl}
                      onChange={(e) => setRegUrl(e.target.value)}
                      placeholder="e.g. ghcr.io, registry.gitlab.com"
                      className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-zinc-700 text-zinc-300"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider block">Username</label>
                    <input
                      type="text"
                      value={regUser}
                      onChange={(e) => setRegUser(e.target.value)}
                      placeholder="e.g. octocat"
                      className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-zinc-700 text-zinc-300"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider block">Password / Access Token</label>
                    <input
                      type="password"
                      value={regPass}
                      onChange={(e) => setRegPass(e.target.value)}
                      placeholder="••••••••••••••••"
                      className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-zinc-700 text-zinc-300"
                    />
                  </div>
                </div>

                {regError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2.5 text-red-400 text-[10px]">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{regError}</span>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    onClick={() => saveRegMutation.mutate({ name: regName, url: regUrl, username: regUser, password: regPass })}
                    disabled={saveRegMutation.isPending || !regName || !regUrl || !regUser || !regPass}
                    className="w-full py-2.5 bg-white hover:bg-zinc-200 disabled:bg-zinc-900 text-zinc-950 disabled:text-zinc-550 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                  >
                    {saveRegMutation.isPending ? 'Saving...' : 'Add Registry'}
                  </button>
                </div>
              </div>
            </div>

            {/* List Column (2 Cols) */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex justify-between items-center pb-1">
                <h3 className="text-xs font-bold text-zinc-450 uppercase tracking-wider">Registered Catalogs</h3>
                <span className="text-[10px] font-mono text-zinc-555 font-bold">{registries.length} Configured</span>
              </div>

              {isRegLoading ? (
                <div className="h-44 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-zinc-700 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : registries.length === 0 ? (
                <div className="border border-[rgba(255,255,255,0.08)] border-dashed rounded-xl p-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-2 bg-[#121418]/30">
                  <ShieldCheck size={24} className="text-zinc-750" />
                  <p className="text-xs font-semibold text-zinc-400">No private registries configured.</p>
                  <p className="text-[9px] text-zinc-650 max-w-xs leading-relaxed">
                    Credentials are encrypted with AES-256-GCM. Image pulls matching registry address prefixes will automatically use these tokens under the hood.
                  </p>
                </div>
              ) : (
                <div className="bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden divide-y divide-white/[0.04]">
                  {registries.map((reg) => (
                    <div key={reg.id} className="p-4 px-5 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-zinc-250">{reg.name}</h4>
                          <span className="px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/10 text-indigo-400 text-[8px] font-mono font-bold rounded uppercase">{reg.username}</span>
                        </div>
                        <p className="text-[9px] font-mono text-zinc-550 mt-1">Registry: {reg.url}</p>
                      </div>

                      <button
                        onClick={() => {
                          if (confirm(`Delete registry credentials for "${reg.name}"?`)) {
                            deleteRegMutation.mutate(reg.id);
                          }
                        }}
                        className="p-1.5 hover:bg-zinc-900 text-zinc-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                        title="Delete Credentials"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tag Modal */}
      {tagId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-xs p-6 bg-[#121418] border border-[rgba(255,255,255,0.08)] rounded-xl space-y-4 text-xs font-sans shadow-lg"
          >
            <h3 className="font-bold text-zinc-200">Tag Registry Image</h3>
            <div className="space-y-3 font-semibold">
              <div className="space-y-1">
                <label className="text-zinc-500 uppercase tracking-wider text-[9px]">Repository Path</label>
                <input
                  type="text"
                  value={tagRepo}
                  onChange={(e) => setTagRepo(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-zinc-700 text-zinc-300"
                />
              </div>
              <div className="space-y-1">
                <label className="text-zinc-500 uppercase tracking-wider text-[9px]">Version Tag</label>
                <input
                  type="text"
                  value={tagTag}
                  onChange={(e) => setTagTag(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-zinc-700 text-zinc-300"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 font-bold">
              <button
                onClick={() => setTagId(null)}
                className="px-3 py-1.5 bg-[#0B0D10] hover:bg-zinc-900 text-zinc-455 rounded-lg border border-[rgba(255,255,255,0.08)] cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  tagMutation.mutate({ id: tagId, repo: tagRepo, tag: tagTag });
                }}
                className="px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-900 rounded-lg cursor-pointer transition-colors"
              >
                Apply
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};

export default Images;
