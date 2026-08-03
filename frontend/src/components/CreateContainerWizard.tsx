import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Search, Plus, Trash2, CheckCircle2, Code } from 'lucide-react';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';

const fuzzyMatch = (text: string, query: string): boolean => {
  if (!query) return true;
  const target = text.toLowerCase();
  const pattern = query.toLowerCase();
  let patternIdx = 0;
  for (let i = 0; i < target.length; i++) {
    if (target[i] === pattern[patternIdx]) {
      patternIdx++;
      if (patternIdx === pattern.length) return true;
    }
  }
  return false;
};

const normalizeImageName = (name: string): string => {
  if (!name) return '';
  let normalized = name.toLowerCase();
  if (normalized.startsWith('docker.io/library/')) {
    normalized = normalized.slice('docker.io/library/'.length);
  }
  if (normalized.startsWith('docker.io/')) {
    normalized = normalized.slice('docker.io/'.length);
  }
  if (normalized.startsWith('library/')) {
    normalized = normalized.slice('library/'.length);
  }
  if (!normalized.includes(':')) {
    normalized += ':latest';
  }
  return normalized;
};

interface CreateContainerWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (containerId: string) => void;
}

export const generateDockerRunCommand = (config: any) => {
  const parts = ['docker run -d'];
  
  if (config.name) {
    parts.push(`--name ${config.name}`);
  }
  if (config.hostname) {
    parts.push(`--hostname ${config.hostname}`);
  }
  
  // Labels
  if (config.labels) {
    Object.entries(config.labels).forEach(([k, v]) => {
      if (k) parts.push(`-l "${k}=${v}"`);
    });
  }

  // Network
  if (config.networkMode && config.networkMode !== 'bridge') {
    parts.push(`--network ${config.networkMode}`);
  }

  // Ports
  if (config.portMappings) {
    config.portMappings.forEach((p: any) => {
      if (p.containerPort) {
        if (p.hostPort) {
          parts.push(`-p ${p.hostPort}:${p.containerPort}/${p.protocol || 'tcp'}`);
        } else {
          parts.push(`--expose ${p.containerPort}`);
        }
      }
    });
  }

  // Volumes
  if (config.volumes) {
    config.volumes.forEach((v: any) => {
      const source = v.type === 'bind' ? v.hostPath : v.volumeName;
      if (source && v.containerPath) {
        const ro = v.readOnly ? ':ro' : '';
        parts.push(`-v ${source}:${v.containerPath}${ro}`);
      }
    });
  }

  // Environment
  if (config.env) {
    config.env.forEach((e: any) => {
      if (e.key) {
        parts.push(`-e "${e.key}=${e.value || ''}"`);
      }
    });
  }

  // Restart Policy
  if (config.restartPolicy && config.restartPolicy !== 'never' && config.restartPolicy !== 'no') {
    parts.push(`--restart ${config.restartPolicy}`);
  }

  // Resources
  if (config.memoryLimit) {
    parts.push(`-m ${config.memoryLimit}m`);
  }
  if (config.cpuLimit) {
    parts.push(`--cpus ${config.cpuLimit}`);
  }

  // Entrypoint override
  if (config.entrypoint) {
    parts.push(`--entrypoint "${config.entrypoint}"`);
  }

  // Image
  parts.push(config.image || 'image-name');

  // Command
  if (config.cmd) {
    parts.push(config.cmd);
  }

  return parts.join(' \\\n  ');
};

export const CreateContainerWizard: React.FC<CreateContainerWizardProps> = ({ isOpen, onClose, onSuccess }) => {
  const socket = useSocket();
  const [step, setStep] = useState(1);
  const [localImages, setLocalImages] = useState<any[]>([]);
  const [imageSearch, setImageSearch] = useState('');
  const [searchSource, setSearchSource] = useState<'local' | 'hub'>('local');
  const [hubResults, setHubResults] = useState<any[]>([]);
  const [isSearchingHub, setIsSearchingHub] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Wizard state values
  const [image, setImage] = useState('');
  const [name, setName] = useState('');
  const [hostname, setHostname] = useState('');
  const [labels, setLabels] = useState<{ key: string; value: string }[]>([]);
  const [entrypoint, setEntrypoint] = useState('');
  const [cmd, setCmd] = useState('');

  const [networkMode, setNetworkMode] = useState('bridge');
  const [portMappings, setPortMappings] = useState<{ hostPort: string; containerPort: string; protocol: string }[]>([]);

  const [volumes, setVolumes] = useState<{ type: 'bind' | 'volume'; hostPath?: string; volumeName?: string; containerPath: string; readOnly: boolean }[]>([]);

  const [env, setEnv] = useState<{ key: string; value: string }[]>([]);
  const [restartPolicy, setRestartPolicy] = useState('unless-stopped');
  const [memoryLimit, setMemoryLimit] = useState(512); // MB
  const [cpuLimit, setCpuLimit] = useState(1); // Cores

  // Pull progress states
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState('');
  const [pullPercent, setPullPercent] = useState(0);
  const [pullError, setPullError] = useState<string | null>(null);

  // Launch timeline checkpoints
  const [launchStep, setLaunchStep] = useState(0);
  const [launchError, setLaunchError] = useState<string | null>(null);

  // Load local images
  useEffect(() => {
    if (!isOpen) return;
    api.get('/images')
      .then((res) => setLocalImages(res || []))
      .catch((err) => console.error('Failed to get images', err));
  }, [isOpen]);

  // Debounced Docker Hub Search Hook (300ms)
  useEffect(() => {
    if (searchSource !== 'hub' || !imageSearch.trim()) {
      setHubResults([]);
      setSearchError(null);
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      setIsSearchingHub(true);
      setSearchError(null);
      api.get(`/images/search?query=${encodeURIComponent(imageSearch)}`)
        .then((res) => {
          setHubResults(res || []);
        })
        .catch((err) => {
          console.error('Docker Hub search failed', err);
          setSearchError(err.message || 'Registry search failed. Ensure your Docker daemon has internet access.');
          setHubResults([]);
        })
        .finally(() => {
          setIsSearchingHub(false);
        });
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [imageSearch, searchSource]);

  // WebSocket Image Pull Status Listeners
  useEffect(() => {
    if (!socket || !isPulling || !image) return;

    const handleProgress = (data: any) => {
      // Normalize comparison to prevent case-sensitive tag differences
      if (data.imageName.toLowerCase().replace(':latest', '') !== image.toLowerCase().replace(':latest', '')) return;
      
      let progressText = data.status || 'Downloading...';
      if (data.id) {
        progressText = `[${data.id}] ${progressText}`;
      }
      if (data.progress) {
        progressText += ` - ${data.progress}`;
      }
      setPullProgress(progressText);

      if (data.progressDetail && data.progressDetail.total) {
        const percent = Math.round((data.progressDetail.current / data.progressDetail.total) * 100);
        setPullPercent(percent);
      }
    };

    const handleStatus = (data: any) => {
      if (data.imageName.toLowerCase().replace(':latest', '') !== image.toLowerCase().replace(':latest', '')) return;

      if (data.status === 'completed') {
        setPullProgress('Pull completed successfully!');
        setPullPercent(100);
        setTimeout(() => {
          setIsPulling(false);
          // Reload local repository images
          api.get('/images')
            .then((res) => {
              setLocalImages(res || []);
              setSearchSource('local');
              setImageSearch('');
            })
            .catch((err) => console.error('Failed to get images', err));
        }, 800);
      } else if (data.status === 'error') {
        setIsPulling(false);
        setPullError(data.error || 'Failed to pull image');
      }
    };

    socket.on('pull-progress', handleProgress);
    socket.on('pull-status', handleStatus);

    return () => {
      socket.off('pull-progress', handleProgress);
      socket.off('pull-status', handleStatus);
    };
  }, [socket, isPulling, image]);

  const handleHubSelect = async (imgName: string) => {
    const targetImageName = imgName.includes(':') ? imgName : `${imgName}:latest`;
    setImage(targetImageName);

    // Verify if image is already present in local list
    const isLocal = localImages.some(img =>
      img.repoTags?.some((tag: string) => normalizeImageName(tag) === normalizeImageName(targetImageName))
    );

    if (isLocal) {
      setSearchSource('local');
      setImageSearch('');
      return;
    }

    // Auto-pull missing image
    setIsPulling(true);
    setPullProgress('Initiating Docker Hub image download...');
    setPullError(null);
    setPullPercent(0);

    try {
      await api.post('/images/pull', { imageName: targetImageName, socketId: socket?.id });
    } catch (e: any) {
      setIsPulling(false);
      setPullError(e.message || 'Failed to start image pull');
    }
  };

  const addPortMapping = () => setPortMappings([...portMappings, { hostPort: '', containerPort: '', protocol: 'tcp' }]);
  const removePortMapping = (idx: number) => setPortMappings(portMappings.filter((_, i) => i !== idx));

  const addVolume = () => setVolumes([...volumes, { type: 'volume', volumeName: '', containerPath: '', readOnly: false }]);
  const removeVolume = (idx: number) => setVolumes(volumes.filter((_, i) => i !== idx));

  const addEnv = () => setEnv([...env, { key: '', value: '' }]);
  const removeEnv = (idx: number) => setEnv(env.filter((_, i) => i !== idx));

  const addLabel = () => setLabels([...labels, { key: '', value: '' }]);
  const removeLabel = (idx: number) => setLabels(labels.filter((_, i) => i !== idx));

  const handleLaunch = async () => {
    setStep(7);
    setLaunchStep(1); // Creating Container
    setLaunchError(null);

    // Convert labels list to dictionary
    const labelDict: Record<string, string> = {};
    labels.forEach(l => {
      if (l.key) labelDict[l.key] = l.value;
    });

    const payload = {
      name: name || undefined,
      image,
      hostname: hostname || undefined,
      labels: labelDict,
      entrypoint: entrypoint || undefined,
      cmd: cmd || undefined,
      networkMode,
      portMappings: portMappings.filter(p => p.containerPort),
      volumes: volumes.filter(v => v.containerPath && (v.hostPath || v.volumeName)),
      env: env.filter(e => e.key),
      restartPolicy,
      memoryLimit: memoryLimit || undefined,
      cpuLimit: cpuLimit || undefined,
    };

    try {
      // Step 1: pull check
      const imageExistsLocal = localImages.some(i =>
        i.repoTags?.some((tag: string) => normalizeImageName(tag) === normalizeImageName(image))
      );
      if (!imageExistsLocal) {
        setLaunchStep(1); // Pulling Image (if missing)
      }

      await new Promise(r => setTimeout(r, 1000));
      setLaunchStep(2); // Configuring Network

      await new Promise(r => setTimeout(r, 800));
      setLaunchStep(3); // Mounting Volumes

      await new Promise(r => setTimeout(r, 800));
      setLaunchStep(4); // Starting Container

      const res = await api.post('/containers', payload);
      
      await new Promise(r => setTimeout(r, 800));
      setLaunchStep(5); // Running

      await new Promise(r => setTimeout(r, 1000));
      onSuccess(res.id);
    } catch (e: any) {
      setLaunchError(e.message || 'Deployment failed');
    }
  };

  const getCLICommand = () => {
    const labelDict: Record<string, string> = {};
    labels.forEach(l => {
      if (l.key) labelDict[l.key] = l.value;
    });
    return generateDockerRunCommand({
      name,
      image,
      hostname,
      labels: labelDict,
      entrypoint,
      cmd,
      networkMode,
      portMappings: portMappings.filter(p => p.containerPort),
      volumes: volumes.filter(v => v.containerPath),
      env: env.filter(e => e.key),
      restartPolicy,
      memoryLimit,
      cpuLimit
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B0D10]/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-3xl bg-[#121418] border border-[rgba(255,255,255,0.08)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-zinc-200"
      >
        {/* Header */}
        <div className="p-5 px-6 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white">Create Container Node</h2>
            <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wide">
              Step {step} of 6 — {step === 1 && 'Choose Image'}
              {step === 2 && 'Configuration'}
              {step === 3 && 'Networking'}
              {step === 4 && 'Volumes'}
              {step === 5 && 'Environment & Resource Policies'}
              {step === 6 && 'Review Draft'}
              {step === 7 && 'Deploying Container'}
            </p>
          </div>
          {step < 7 && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Steps container */}
        <div className="flex-1 p-6 overflow-y-auto min-h-0 space-y-6">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex gap-2">
                  <button
                    onClick={() => setSearchSource('local')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                      searchSource === 'local'
                        ? 'bg-[#0db7ed]/10 text-[#0db7ed] border-[#0db7ed]/30'
                        : 'bg-zinc-900 border-white/[0.04] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Local Images
                  </button>
                  <button
                    onClick={() => setSearchSource('hub')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                      searchSource === 'hub'
                        ? 'bg-[#0db7ed]/10 text-[#0db7ed] border-[#0db7ed]/30'
                        : 'bg-zinc-900 border-white/[0.04] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Docker Hub Registry
                  </button>
                </div>

                {isPulling ? (
                  <div className="p-8 bg-zinc-900/60 border border-white/[0.04] rounded-xl flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-8 h-8 border-3 border-[#0db7ed] border-t-transparent rounded-full animate-spin"></div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-white">Downloading {image} from Registry...</h4>
                      <p className="text-[10px] font-mono text-zinc-500 max-w-md truncate">{pullProgress}</p>
                    </div>
                    <div className="w-full max-w-xs bg-zinc-950 h-2 rounded-full overflow-hidden border border-white/[0.02] relative">
                      <div 
                        className="bg-[#0db7ed] h-full transition-all duration-300"
                        style={{ width: `${pullPercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-[#0db7ed] font-bold">{pullPercent}% Completed</span>
                  </div>
                ) : pullError ? (
                  <div className="p-6 bg-red-950/20 border border-red-500/20 rounded-xl text-center space-y-4">
                    <h4 className="text-xs font-bold text-red-400">Download Operations Failed</h4>
                    <p className="text-[10px] font-mono text-red-300 max-w-md mx-auto break-all">{pullError}</p>
                    <button
                      onClick={() => { setPullError(null); setImage(''); }}
                      className="px-4 py-2 bg-zinc-900 hover:bg-zinc-850 border border-white/[0.04] rounded-xl text-xs text-white font-bold cursor-pointer"
                    >
                      Clear & Retry
                    </button>
                  </div>
                ) : searchSource === 'local' ? (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search size={14} className="absolute left-3.5 top-3.5 text-zinc-550" />
                      <input
                        type="text"
                        placeholder="Search local repository images..."
                        value={imageSearch}
                        onChange={(e) => setImageSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-700"
                      />
                    </div>
 
                    <div className="max-h-[300px] overflow-y-auto space-y-2 no-scrollbar pr-1">
                      {(() => {
                        const mappedLocalImages = localImages.flatMap(img => {
                          const tags = img.repoTags && img.repoTags.length > 0 ? img.repoTags : ['<none>:<none>'];
                          return tags.map((tagString: string) => {
                            const parts = tagString.split(':');
                            const name = parts[0] || tagString;
                            const tag = parts[1] || 'latest';
                            const shortId = img.id.replace('sha256:', '').slice(0, 12);
                            const sizeMB = ((img.size || 0) / 1024 / 1024).toFixed(1);
                            return { raw: img, fullName: tagString, name, tag, shortId, sizeMB };
                          });
                        });
                        
                        const filteredLocalImages = mappedLocalImages.filter(img =>
                          fuzzyMatch(img.name, imageSearch) ||
                          fuzzyMatch(img.tag, imageSearch) ||
                          fuzzyMatch(img.shortId, imageSearch) ||
                          fuzzyMatch(img.fullName, imageSearch)
                        );

                        return (
                          <>
                            {filteredLocalImages.map((img, i) => {
                              const isSelected = image === img.fullName;
                              return (
                                <div
                                  key={i}
                                  onClick={() => setImage(img.fullName)}
                                  className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                    isSelected
                                      ? 'bg-[#0db7ed]/5 border-[#0db7ed]/40 text-[#0db7ed]'
                                      : 'bg-zinc-900/50 hover:bg-zinc-900 border-white/[0.04] hover:border-zinc-800'
                                  }`}
                                >
                                  <div className="flex flex-col gap-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-zinc-200 truncate text-xs">{img.name}</span>
                                      <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 font-mono text-[9px] rounded-md shrink-0">{img.tag}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] text-zinc-550 font-mono">
                                      <span>ID: {img.shortId}</span>
                                      <span>•</span>
                                      <span>{img.sizeMB} MB</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            {localImages.length === 0 ? (
                              <div className="text-center p-8 text-xs text-zinc-650 font-medium">
                                No local images found on host. Try Docker Hub registry tab.
                              </div>
                            ) : filteredLocalImages.length === 0 ? (
                              <div className="text-center p-8 text-xs text-zinc-550 font-medium">
                                No matching local images found.
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search size={14} className="absolute left-3.5 top-3.5 text-zinc-550" />
                      <input
                        type="text"
                        placeholder="Search Docker Hub registry (e.g. redis, postgres)..."
                        value={imageSearch}
                        onChange={(e) => setImageSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-700"
                      />
                    </div>
 
                    {searchError && (
                      <div className="p-3 bg-red-950/20 border border-red-500/20 text-red-300 text-[10px] font-medium rounded-xl">
                        {searchError}
                      </div>
                    )}
 
                    {isSearchingHub && (
                      <div className="text-center p-4 text-xs text-zinc-500 font-medium flex items-center justify-center gap-2">
                        <div className="w-3.5 h-3.5 border-2 border-zinc-550 border-t-transparent rounded-full animate-spin"></div>
                        Searching registry...
                      </div>
                    )}
 
                    <div className="max-h-[300px] overflow-y-auto space-y-2 no-scrollbar pr-1">
                      {hubResults.map((res, i) => {
                        const isSelected = image === res.name || image === `${res.name}:latest`;
                        return (
                          <div
                            key={i}
                            onClick={() => handleHubSelect(res.name)}
                            className={`p-3.5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-[#0db7ed]/5 border-[#0db7ed]/40 text-[#0db7ed]'
                                : 'bg-zinc-900/50 hover:bg-zinc-900 border-white/[0.04] hover:border-zinc-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-200 text-xs">{res.name}</span>
                              {res.is_official && (
                                <span className="px-1.5 py-0.5 bg-[#0db7ed]/15 text-[#0db7ed] font-extrabold text-[8px] tracking-wide rounded uppercase shrink-0">
                                  Official
                                </span>
                              )}
                              {res.is_automated && (
                                <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 font-extrabold text-[8px] tracking-wide rounded uppercase shrink-0">
                                  Automated
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-1.5 line-clamp-2 leading-relaxed">{res.description || 'No description provided.'}</p>
                            <div className="flex items-center gap-3 text-[9px] text-zinc-550 font-mono mt-2">
                              <span>Stars: {res.star_count}</span>
                              <span>•</span>
                              <span>Pulls: {res.pull_count ? Number(res.pull_count).toLocaleString() : '0'}</span>
                              <span>•</span>
                              <span>Tag: {res.latest_tag || 'latest'}</span>
                            </div>
                          </div>
                        );
                      })}
                      {hubResults.length === 0 && !isSearchingHub && !searchError && (
                        <div className="text-center p-8 text-xs text-zinc-655 font-medium">
                          Search Docker Hub to pull and run public registry images.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {image && (
                  <div className="p-3 bg-zinc-900 border border-[rgba(255,255,255,0.05)] rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[9px] block text-zinc-550 uppercase font-extrabold tracking-wider">SELECTED IMAGE</span>
                      <span className="text-xs font-mono font-bold text-zinc-300">{image}</span>
                    </div>
                    <button
                      onClick={() => setImage('')}
                      className="text-zinc-500 hover:text-red-400 p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Container Name</label>
                    <input
                      type="text"
                      placeholder="e.g. dev-redis-cache"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Hostname</label>
                    <input
                      type="text"
                      placeholder="e.g. cache-server"
                      value={hostname}
                      onChange={(e) => setHostname(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Entrypoint Override</label>
                    <input
                      type="text"
                      placeholder="e.g. /usr/bin/redis-server"
                      value={entrypoint}
                      onChange={(e) => setEntrypoint(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Command Override (CMD)</label>
                    <input
                      type="text"
                      placeholder="e.g. --port 6379"
                      value={cmd}
                      onChange={(e) => setCmd(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                </div>

                {/* Custom Labels Section */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Custom Node Labels</label>
                    <button
                      onClick={addLabel}
                      className="flex items-center gap-1 text-[10px] font-bold text-[#0db7ed] hover:underline cursor-pointer"
                    >
                      <Plus size={10} /> Add Label
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[150px] overflow-y-auto no-scrollbar">
                    {labels.map((lbl, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="label-key"
                          value={lbl.key}
                          onChange={(e) => {
                            const newLabels = [...labels];
                            newLabels[idx].key = e.target.value;
                            setLabels(newLabels);
                          }}
                          className="flex-1 px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs text-zinc-250 focus:outline-none"
                        />
                        <input
                          type="text"
                          placeholder="label-value"
                          value={lbl.value}
                          onChange={(e) => {
                            const newLabels = [...labels];
                            newLabels[idx].value = e.target.value;
                            setLabels(newLabels);
                          }}
                          className="flex-1 px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs text-zinc-250 focus:outline-none"
                        />
                        <button
                          onClick={() => removeLabel(idx)}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-900 rounded-lg cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {labels.length === 0 && (
                      <div className="text-[10px] text-zinc-600 italic">No labels added. Click add to tag container nodes.</div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Network Driver / Mode</label>
                  <select
                    value={networkMode}
                    onChange={(e) => setNetworkMode(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs text-zinc-200 focus:outline-none"
                  >
                    <option value="bridge">bridge (Isolated Node)</option>
                    <option value="host">host (Direct Host Namespace)</option>
                    <option value="none">none (No Network Interfaces)</option>
                  </select>
                </div>

                {/* Port mappings builder */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Host Port Bindings</label>
                    <button
                      onClick={addPortMapping}
                      disabled={networkMode === 'host' || networkMode === 'none'}
                      className="flex items-center gap-1 text-[10px] font-bold text-[#0db7ed] hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      <Plus size={10} /> Add Port Binding
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[180px] overflow-y-auto no-scrollbar">
                    {portMappings.map((port, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Host Port (e.g. 8080)"
                          value={port.hostPort}
                          onChange={(e) => {
                            const newPorts = [...portMappings];
                            newPorts[idx].hostPort = e.target.value;
                            setPortMappings(newPorts);
                          }}
                          className="flex-1 px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs text-zinc-250 focus:outline-none"
                        />
                        <span className="text-zinc-650 text-xs">→</span>
                        <input
                          type="text"
                          placeholder="Container Port (e.g. 80)"
                          value={port.containerPort}
                          onChange={(e) => {
                            const newPorts = [...portMappings];
                            newPorts[idx].containerPort = e.target.value;
                            setPortMappings(newPorts);
                          }}
                          className="flex-1 px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs text-zinc-250 focus:outline-none"
                        />
                        <select
                          value={port.protocol}
                          onChange={(e) => {
                            const newPorts = [...portMappings];
                            newPorts[idx].protocol = e.target.value;
                            setPortMappings(newPorts);
                          }}
                          className="px-2 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs text-zinc-250 focus:outline-none"
                        >
                          <option value="tcp">TCP</option>
                          <option value="udp">UDP</option>
                        </select>
                        <button
                          onClick={() => removePortMapping(idx)}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-900 rounded-lg cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {portMappings.length === 0 && (
                      <div className="text-[10px] text-zinc-600 italic">
                        {networkMode === 'host'
                          ? 'Host networking maps container directly to host network interface.'
                          : 'No ports bound. Container remains isolated internally.'}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Mount Paths & Volume Binds</label>
                  <button
                    onClick={addVolume}
                    className="flex items-center gap-1 text-[10px] font-bold text-[#0db7ed] hover:underline cursor-pointer"
                  >
                    <Plus size={10} /> Add Mount
                  </button>
                </div>

                <div className="space-y-3 max-h-[250px] overflow-y-auto no-scrollbar">
                  {volumes.map((vol, idx) => (
                    <div key={idx} className="p-3 bg-zinc-900/50 border border-white/[0.04] rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <select
                          value={vol.type}
                          onChange={(e) => {
                            const newVols = [...volumes];
                            newVols[idx].type = e.target.value as 'bind' | 'volume';
                            setVolumes(newVols);
                          }}
                          className="px-2 py-1 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-lg text-[10px] text-zinc-300 focus:outline-none"
                        >
                          <option value="volume">Named Volume</option>
                          <option value="bind">Host Directory Bind</option>
                        </select>
                        <button
                          onClick={() => removeVolume(idx)}
                          className="p-1 text-zinc-500 hover:text-red-400 rounded-lg cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {vol.type === 'bind' ? (
                          <input
                            type="text"
                            placeholder="Host directory (e.g. /opt/data)"
                            value={vol.hostPath || ''}
                            onChange={(e) => {
                              const newVols = [...volumes];
                              newVols[idx].hostPath = e.target.value;
                              setVolumes(newVols);
                            }}
                            className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs text-zinc-250 focus:outline-none"
                          />
                        ) : (
                          <input
                            type="text"
                            placeholder="Volume Name (e.g. pg-data)"
                            value={vol.volumeName || ''}
                            onChange={(e) => {
                              const newVols = [...volumes];
                              newVols[idx].volumeName = e.target.value;
                              setVolumes(newVols);
                            }}
                            className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs text-zinc-250 focus:outline-none"
                          />
                        )}

                        <input
                          type="text"
                          placeholder="Container Mount point (e.g. /data)"
                          value={vol.containerPath}
                          onChange={(e) => {
                            const newVols = [...volumes];
                            newVols[idx].containerPath = e.target.value;
                            setVolumes(newVols);
                          }}
                          className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs text-zinc-250 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`ro-${idx}`}
                          checked={vol.readOnly}
                          onChange={(e) => {
                            const newVols = [...volumes];
                            newVols[idx].readOnly = e.target.checked;
                            setVolumes(newVols);
                          }}
                          className="rounded border-[rgba(255,255,255,0.08)] bg-zinc-950 text-[#0db7ed] focus:ring-0"
                        />
                        <label htmlFor={`ro-${idx}`} className="text-[10px] font-bold text-zinc-500 uppercase select-none cursor-pointer">
                          Read-Only mount
                        </label>
                      </div>
                    </div>
                  ))}
                  {volumes.length === 0 && (
                    <div className="text-[10px] text-zinc-600 italic">No storage volumes configured. Storage remains transient.</div>
                  )}
                </div>
              </motion.div>
            )}

            {step === 5 && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                {/* Env variables list */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Environment Variables</label>
                    <button
                      onClick={addEnv}
                      className="flex items-center gap-1 text-[10px] font-bold text-[#0db7ed] hover:underline cursor-pointer"
                    >
                      <Plus size={10} /> Add Env Variable
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[150px] overflow-y-auto no-scrollbar">
                    {env.map((variable, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="KEY (e.g. PORT)"
                          value={variable.key}
                          onChange={(e) => {
                            const newEnv = [...env];
                            newEnv[idx].key = e.target.value;
                            setEnv(newEnv);
                          }}
                          className="flex-1 px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs font-mono text-zinc-250 focus:outline-none"
                        />
                        <input
                          type="text"
                          placeholder="VALUE"
                          value={variable.value}
                          onChange={(e) => {
                            const newEnv = [...env];
                            newEnv[idx].value = e.target.value;
                            setEnv(newEnv);
                          }}
                          className="flex-1 px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs font-mono text-zinc-250 focus:outline-none"
                        />
                        <button
                          onClick={() => removeEnv(idx)}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-900 rounded-lg cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    {env.length === 0 && (
                      <div className="text-[10px] text-zinc-600 italic">No environment configurations mapped.</div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Restart Policy</label>
                    <select
                      value={restartPolicy}
                      onChange={(e) => setRestartPolicy(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl text-xs text-zinc-200 focus:outline-none"
                    >
                      <option value="unless-stopped">Unless Stopped (Recommended)</option>
                      <option value="always">Always</option>
                      <option value="on-failure">On Failure</option>
                      <option value="never">Never (No restart)</option>
                    </select>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase">
                        <span>CPU Limit</span>
                        <span className="text-[#0db7ed] font-mono">{cpuLimit} Cores</span>
                      </div>
                      <input
                        type="range"
                        min="0.25"
                        max="4"
                        step="0.25"
                        value={cpuLimit}
                        onChange={(e) => setCpuLimit(parseFloat(e.target.value))}
                        className="w-full accent-[#0db7ed]"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase">
                        <span>Memory Limit</span>
                        <span className="text-[#0db7ed] font-mono">{memoryLimit} MB</span>
                      </div>
                      <input
                        type="range"
                        min="64"
                        max="2048"
                        step="64"
                        value={memoryLimit}
                        onChange={(e) => setMemoryLimit(parseInt(e.target.value))}
                        className="w-full accent-[#0db7ed]"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 6 && (
              <motion.div
                key="step6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4 text-xs"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-zinc-900 border border-white/[0.04] rounded-xl space-y-2">
                    <span className="text-[9px] font-extrabold text-zinc-550 uppercase block">Node Details</span>
                    <p className="flex justify-between"><span className="text-zinc-500 font-medium">Image</span> <span className="font-mono text-zinc-200 text-[10px] font-bold">{image}</span></p>
                    <p className="flex justify-between"><span className="text-zinc-500 font-medium">Name</span> <span className="text-zinc-200 font-bold">{name || 'automatic'}</span></p>
                    <p className="flex justify-between"><span className="text-zinc-500 font-medium">Hostname</span> <span className="text-zinc-200 font-bold">{hostname || 'none'}</span></p>
                  </div>

                  <div className="p-4 bg-zinc-900 border border-white/[0.04] rounded-xl space-y-2">
                    <span className="text-[9px] font-extrabold text-zinc-550 uppercase block">Infrastructure Config</span>
                    <p className="flex justify-between"><span className="text-zinc-500 font-medium">Network</span> <span className="text-zinc-200 font-bold font-mono text-[10px]">{networkMode}</span></p>
                    <p className="flex justify-between"><span className="text-zinc-500 font-medium">Restart Policy</span> <span className="text-zinc-200 font-bold">{restartPolicy}</span></p>
                    <p className="flex justify-between"><span className="text-zinc-500 font-medium">CPU Cores</span> <span className="text-zinc-200 font-bold">{cpuLimit} Cores</span></p>
                    <p className="flex justify-between"><span className="text-zinc-500 font-medium">RAM Alloc</span> <span className="text-zinc-200 font-bold">{memoryLimit} MB</span></p>
                  </div>
                </div>

                {/* Expose equivalent Docker CLI Command (Requirement) */}
                <div className="p-4 bg-[#0B0D10] border border-[rgba(255,255,255,0.06)] rounded-xl space-y-2">
                  <div className="flex items-center gap-1.5 text-[#0db7ed]">
                    <Code size={13} />
                    <span className="text-[9px] font-extrabold uppercase tracking-wider">Equivalent Docker CLI Command</span>
                  </div>
                  <pre className="text-[9px] font-mono text-zinc-400 bg-zinc-950 p-3 rounded-lg overflow-x-auto whitespace-pre no-scrollbar border border-white/[0.02]">
                    {getCLICommand()}
                  </pre>
                  <p className="text-[9px] text-zinc-500 font-medium italic">
                    DockOps acts as an orchestration layer. This generated `docker run` command executes on the daemon socket.
                  </p>
                </div>
              </motion.div>
            )}

            {step === 7 && (
              <motion.div
                key="step7"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-8 space-y-6 flex flex-col items-center justify-center text-center"
              >
                {!launchError ? (
                  <div className="space-y-6 w-full max-w-sm">
                    <div className="flex items-center justify-center">
                      <div className="w-8 h-8 border-3 border-[#0db7ed] border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    
                    <div className="space-y-3 font-sans text-xs">
                      <div className="flex justify-between items-center text-[11px] font-semibold text-zinc-300 pb-2 border-b border-white/[0.04]">
                        <span>Creating Container Node</span>
                        {launchStep >= 1 ? <CheckCircle2 size={13} className="text-green-400" /> : <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 animate-pulse" />}
                      </div>
                      <div className="flex justify-between items-center text-[11px] font-semibold text-zinc-300 pb-2 border-b border-white/[0.04]">
                        <span>Configuring Host Network</span>
                        {launchStep >= 2 ? <CheckCircle2 size={13} className="text-green-400" /> : <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />}
                      </div>
                      <div className="flex justify-between items-center text-[11px] font-semibold text-zinc-300 pb-2 border-b border-white/[0.04]">
                        <span>Mounting Volume Assets</span>
                        {launchStep >= 3 ? <CheckCircle2 size={13} className="text-green-400" /> : <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />}
                      </div>
                      <div className="flex justify-between items-center text-[11px] font-semibold text-zinc-300 pb-2 border-b border-white/[0.04]">
                        <span>Starting Container Instance</span>
                        {launchStep >= 4 ? <CheckCircle2 size={13} className="text-green-400" /> : <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />}
                      </div>
                      <div className="flex justify-between items-center text-[11px] font-semibold text-zinc-300">
                        <span>Running Lifecycle Telemetry</span>
                        {launchStep >= 5 ? <CheckCircle2 size={13} className="text-green-400" /> : <div className="w-1.5 h-1.5 rounded-full bg-zinc-700" />}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <span className="text-xs font-bold text-red-400 block">Launch Operations Failed</span>
                    <div className="p-4 bg-red-950/20 border border-red-500/20 rounded-xl text-[10px] font-mono text-red-300 max-w-md break-all">
                      {launchError}
                    </div>
                    <button
                      onClick={() => setStep(6)}
                      className="px-4 py-2 border border-white/[0.06] bg-zinc-900 hover:bg-zinc-800 rounded-xl text-xs text-zinc-350 cursor-pointer font-bold transition-all"
                    >
                      Return to Review
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer controls */}
        {step < 7 && (
          <div className="p-5 px-6 border-t border-[rgba(255,255,255,0.06)] bg-zinc-950/50 flex justify-between">
            <button
              onClick={() => step > 1 && setStep(step - 1)}
              disabled={step === 1}
              className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 border border-white/[0.04] text-zinc-400 hover:text-white rounded-xl text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ChevronLeft size={14} /> Back
            </button>

            {step < 6 ? (
              <button
                onClick={() => step < 6 && setStep(step + 1)}
                disabled={step === 1 && !image}
                className="flex items-center gap-1.5 px-5 py-2 bg-zinc-900 border border-white/[0.04] text-white hover:bg-zinc-850 rounded-xl text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Next <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleLaunch}
                className="flex items-center gap-1.5 px-6 py-2 bg-[#0db7ed] hover:bg-[#0aa6d8] text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-sm shadow-[#0db7ed]/10"
              >
                Launch Container
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};
export default CreateContainerWizard;
