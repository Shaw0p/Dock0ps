import React, { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
import Editor from '@monaco-editor/react';
import {
  Play,
  Square,
  RotateCw,
  RefreshCw,
  Trash2,
  Plus,
  ArrowLeft,
  Workflow,
  AlertCircle,
  FileCode,
  Terminal,
  Activity,
  Server,
  Download,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

interface StackItem {
  id: string;
  name: string;
  yamlContent: string;
  status: 'STOPPED' | 'DEPLOYING' | 'RUNNING' | 'FAILED';
  createdAt: string;
  updatedAt: string;
}

interface StackDetails extends StackItem {
  containers: {
    id: string;
    name: string;
    service: string;
    state: string;
    status: string;
    ports: { PublicPort: number; PrivatePort: number; Type: string }[];
  }[];
}

const DEFAULT_COMPOSE_TEMPLATE = `version: '3.8'

services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    restart: always

  redis:
    image: redis:alpine
    restart: always
`;

export const Stacks: React.FC = () => {
  const queryClient = useQueryClient();
  const socket = useSocket();

  // Navigation & Form States
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'details'>('list');
  const [selectedStackName, setSelectedStackName] = useState<string | null>(null);
  
  // Create / Edit Form States
  const [newStackName, setNewStackName] = useState('');
  const [yamlContent, setYamlContent] = useState(DEFAULT_COMPOSE_TEMPLATE);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Live Console & Logs Buffers
  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
  const [containerLogs, setContainerLogs] = useState<string[]>([]);
  const [activeConsoleTab, setActiveConsoleTab] = useState<'deploy' | 'container'>('deploy');

  const deployTerminalEndRef = useRef<HTMLDivElement>(null);
  const containerTerminalEndRef = useRef<HTMLDivElement>(null);

  // Queries
  const { data: stacks = [], isLoading, refetch } = useQuery<StackItem[]>({
    queryKey: ['stacks'],
    queryFn: () => api.get('/stacks'),
    refetchInterval: 8000,
  });

  const { data: stackDetails } = useQuery<StackDetails>({
    queryKey: ['stackDetails', selectedStackName],
    queryFn: () => api.get(`/stacks/${selectedStackName}`),
    enabled: !!selectedStackName && viewMode === 'details',
    refetchInterval: viewMode === 'details' ? 5000 : false,
  });

  // Socket logs integration
  useEffect(() => {
    if (!socket || !selectedStackName || viewMode !== 'details') return;

    // Join stack logs room
    socket.emit('subscribe-stack-logs', { name: selectedStackName });

    const handleDeployProgress = (data: string) => {
      setDeploymentLogs((prev) => [...prev, data]);
    };

    const handleContainerLog = (data: string) => {
      setContainerLogs((prev) => [...prev, data]);
    };

    const handleStackError = (data: { error: string }) => {
      setDeploymentLogs((prev) => [...prev, `[ERROR] ${data.error}\n`]);
    };

    socket.on(`stack-log-output:${selectedStackName}`, handleDeployProgress);
    socket.on(`stack-logs:${selectedStackName}`, handleContainerLog);
    socket.on(`stack-logs-error:${selectedStackName}`, handleStackError);

    return () => {
      socket.emit('unsubscribe-stack-logs', { name: selectedStackName });
      socket.off(`stack-log-output:${selectedStackName}`, handleDeployProgress);
      socket.off(`stack-logs:${selectedStackName}`, handleContainerLog);
      socket.off(`stack-logs-error:${selectedStackName}`, handleStackError);
    };
  }, [socket, selectedStackName, viewMode]);

  // Scroll to bottom of terminals
  useEffect(() => {
    if (activeConsoleTab === 'deploy') {
      deployTerminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      containerTerminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [deploymentLogs, containerLogs, activeConsoleTab]);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (body: { name: string; yamlContent: string }) => api.post('/stacks', body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['stacks'] });
      setValidationError(null);
      setSelectedStackName(data.name);
      setViewMode('details');
      setDeploymentLogs([`[System] Saved configuration for stack "${data.name}"\n`]);
      setContainerLogs([]);
    },
    onError: (error: any) => {
      setValidationError(error.message || 'Validation failed');
    },
  });

  const deployMutation = useMutation({
    mutationFn: (name: string) => api.post(`/stacks/${name}/deploy`),
    onSuccess: () => {
      setDeploymentLogs((prev) => [...prev, `[System] Deploy request acknowledged. Executing...\n`]);
      queryClient.invalidateQueries({ queryKey: ['stacks'] });
    },
    onError: (err: any) => {
      setDeploymentLogs((prev) => [...prev, `[System] [ERROR] Failed to start deployment: ${err.message}\n`]);
    },
  });

  const stopMutation = useMutation({
    mutationFn: (name: string) => api.post(`/stacks/${name}/stop`),
    onSuccess: () => {
      setDeploymentLogs((prev) => [...prev, `[System] Stop request acknowledged. Stopping stack...\n`]);
      queryClient.invalidateQueries({ queryKey: ['stacks'] });
    },
  });

  const restartMutation = useMutation({
    mutationFn: (name: string) => api.post(`/stacks/${name}/restart`),
    onSuccess: () => {
      setDeploymentLogs((prev) => [...prev, `[System] Restart request acknowledged. Restarting stack...\n`]);
      queryClient.invalidateQueries({ queryKey: ['stacks'] });
    },
  });

  const rebuildMutation = useMutation({
    mutationFn: (name: string) => api.post(`/stacks/${name}/rebuild`),
    onSuccess: () => {
      setDeploymentLogs((prev) => [...prev, `[System] Rebuild request acknowledged. Rebuilding stack...\n`]);
      queryClient.invalidateQueries({ queryKey: ['stacks'] });
    },
  });

  const pullMutation = useMutation({
    mutationFn: (name: string) => api.post(`/stacks/${name}/pull`),
    onSuccess: () => {
      setDeploymentLogs((prev) => [...prev, `[System] Image pull request acknowledged. Fetching layers...\n`]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ name, removeVolumes }: { name: string; removeVolumes: boolean }) =>
      api.delete(`/stacks/${name}?removeVolumes=${removeVolumes}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stacks'] });
      setViewMode('list');
      setSelectedStackName(null);
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'text-green-400 bg-green-400/10 border-green-500/20';
      case 'DEPLOYING': return 'text-blue-400 bg-blue-400/10 border-blue-500/20';
      case 'FAILED': return 'text-red-400 bg-red-400/10 border-red-500/20';
      default: return 'text-zinc-400 bg-zinc-400/10 border-zinc-500/20';
    }
  };

  const openStackDetails = (name: string) => {
    setSelectedStackName(name);
    setDeploymentLogs([]);
    setContainerLogs([]);
    setViewMode('details');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.3 }}
      className="space-y-8 max-w-6xl mx-auto font-sans p-6 text-white"
    >
      <AnimatePresence mode="wait">
        
        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-4 border-b border-[rgba(255,255,255,0.06)]">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white leading-none">
                  Compose Stacks
                </h1>
                <p className="text-xs text-zinc-400 mt-2 font-medium">
                  Manage multi-container Docker applications using Compose configurations.
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
                    setIsEditing(false);
                    setNewStackName('');
                    setYamlContent(DEFAULT_COMPOSE_TEMPLATE);
                    setValidationError(null);
                    setViewMode('create');
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-950 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  <Plus size={14} />
                  New Stack
                </button>
              </div>
            </div>

            {/* Content list */}
            {isLoading ? (
              <div className="h-60 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : stacks.length === 0 ? (
              <div className="border border-[rgba(255,255,255,0.08)] border-dashed rounded-xl p-16 text-center text-zinc-500 flex flex-col items-center justify-center gap-3">
                <Workflow size={32} className="text-zinc-650" />
                <p className="text-sm font-semibold text-zinc-400">No Docker Compose stacks deployed.</p>
                <p className="text-xs text-zinc-650 max-w-sm leading-relaxed">
                  Compose files isolate services, volumes, and networks inside a single stack configuration folder. Create your first stack to get started.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {stacks.map((stack) => (
                  <motion.div
                    key={stack.id}
                    whileHover={{ y: -2 }}
                    onClick={() => openStackDetails(stack.name)}
                    className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] hover:border-zinc-700 rounded-xl cursor-pointer transition-all flex flex-col justify-between h-44 shadow-sm"
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <h3 className="text-sm font-bold text-zinc-200 truncate pr-4">{stack.name}</h3>
                        <span className={`text-[9px] font-bold px-2 py-0.5 border rounded-full uppercase tracking-wide font-mono ${getStatusColor(stack.status)}`}>
                          {stack.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500 font-mono line-clamp-3">
                        {stack.yamlContent}
                      </p>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-zinc-550 border-t border-white/[0.04] pt-3">
                      <span>Updated {new Date(stack.updatedAt).toLocaleString()}</span>
                      <span className="font-semibold text-indigo-400 hover:underline">Manage Stack &rarr;</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* CREATE / EDIT VIEW */}
        {(viewMode === 'create' || isEditing) && (
          <motion.div
            key="editor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4 pb-4 border-b border-[rgba(255,255,255,0.06)]">
              <button
                onClick={() => setViewMode(isEditing ? 'details' : 'list')}
                className="p-2 border border-[rgba(255,255,255,0.08)] bg-[#121418] hover:bg-[#181a20] rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
              </button>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white leading-none">
                  {isEditing ? `Edit Stack: ${selectedStackName}` : 'Create Compose Stack'}
                </h1>
                <p className="text-[10px] text-zinc-500 mt-1.5 uppercase font-bold tracking-wider">
                  Monaco YAML Configuration Editor
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Settings Column */}
              <div className="space-y-6">
                <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl space-y-4 shadow-sm">
                  <h3 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-2">
                    <FileCode size={14} className="text-indigo-400" /> Stack Parameters
                  </h3>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Stack Name</label>
                    <input
                      type="text"
                      value={newStackName}
                      disabled={isEditing}
                      onChange={(e) => setNewStackName(e.target.value.toLowerCase())}
                      placeholder="e.g. static-web"
                      className="w-full px-4 py-2.5 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-zinc-350 focus:outline-none focus:border-zinc-700 disabled:opacity-50"
                    />
                    <p className="text-[9px] text-zinc-650 leading-relaxed">
                      Must be unique, lowercase, and contain only alphanumeric characters, dashes, and underscores.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => saveMutation.mutate({ name: isEditing ? selectedStackName! : newStackName, yamlContent })}
                      disabled={saveMutation.isPending || (!isEditing && !newStackName)}
                      className="w-full py-2.5 bg-white hover:bg-zinc-200 disabled:bg-zinc-900 text-zinc-950 disabled:text-zinc-550 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                    >
                      {saveMutation.isPending ? 'Validating...' : isEditing ? 'Save Changes' : 'Validate & Save'}
                    </button>
                  </div>
                </div>

                {/* Validation Feed Alert */}
                {validationError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3 text-red-400">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs">
                      <p className="font-bold">YAML Error Detected</p>
                      <pre className="text-[9px] font-mono leading-relaxed bg-[#0B0D10]/40 p-2.5 rounded-lg border border-red-500/10 max-h-40 overflow-y-auto whitespace-pre-wrap">
                        {validationError}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              {/* Editor Column (2 Cols) */}
              <div className="lg:col-span-2 h-[450px] bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden shadow-md">
                <Editor
                  height="100%"
                  language="yaml"
                  theme="vs-dark"
                  value={yamlContent}
                  onChange={(val) => setYamlContent(val || '')}
                  options={{
                    fontSize: 12,
                    fontFamily: 'JetBrains Mono, monospace',
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 16, bottom: 16 },
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* DETAILS VIEW */}
        {viewMode === 'details' && stackDetails && (
          <motion.div
            key="details"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-8"
          >
            {/* Header / Actions Row */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 pb-6 border-b border-[rgba(255,255,255,0.06)]">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setViewMode('list');
                    setSelectedStackName(null);
                  }}
                  className="p-2 border border-[rgba(255,255,255,0.08)] bg-[#121418] hover:bg-[#181a20] rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <ArrowLeft size={14} />
                </button>
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-extrabold tracking-tight text-white leading-none">
                      {stackDetails.name}
                    </h1>
                    <span className={`text-[9px] font-bold px-2.5 py-0.5 border rounded-full uppercase tracking-wider font-mono ${getStatusColor(stackDetails.status)}`}>
                      {stackDetails.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase mt-2 tracking-wider">
                    Compose Workspace Configuration
                  </p>
                </div>
              </div>

              {/* Action Operations Bar */}
              <div className="flex flex-wrap gap-2.5">
                <button
                  onClick={() => deployMutation.mutate(stackDetails.name)}
                  disabled={stackDetails.status === 'DEPLOYING'}
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-sm"
                  title="Deploy / docker compose up"
                >
                  <Play size={12} /> Deploy
                </button>
                <button
                  onClick={() => stopMutation.mutate(stackDetails.name)}
                  disabled={stackDetails.status === 'DEPLOYING'}
                  className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 hover:text-white rounded-lg text-xs font-semibold transition-all cursor-pointer border border-[rgba(255,255,255,0.06)]"
                  title="Stop / docker compose down"
                >
                  <Square size={12} /> Stop
                </button>
                <button
                  onClick={() => restartMutation.mutate(stackDetails.name)}
                  disabled={stackDetails.status === 'DEPLOYING'}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#121418] hover:bg-zinc-900 text-zinc-300 rounded-lg text-xs font-semibold transition-all cursor-pointer border border-[rgba(255,255,255,0.06)]"
                >
                  <RotateCw size={12} /> Restart
                </button>
                <button
                  onClick={() => rebuildMutation.mutate(stackDetails.name)}
                  disabled={stackDetails.status === 'DEPLOYING'}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#121418] hover:bg-zinc-900 text-zinc-300 rounded-lg text-xs font-semibold transition-all cursor-pointer border border-[rgba(255,255,255,0.06)]"
                >
                  <RefreshCw size={12} /> Rebuild
                </button>
                <button
                  onClick={() => pullMutation.mutate(stackDetails.name)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#121418] hover:bg-zinc-900 text-zinc-300 rounded-lg text-xs font-semibold transition-all cursor-pointer border border-[rgba(255,255,255,0.06)]"
                >
                  <Download size={12} /> Pull
                </button>
                <button
                  onClick={() => {
                    setNewStackName(stackDetails.name);
                    setYamlContent(stackDetails.yamlContent);
                    setIsEditing(true);
                    setValidationError(null);
                    setViewMode('create');
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-xs font-semibold transition-all cursor-pointer border border-indigo-500/20"
                >
                  Edit Configuration
                </button>
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to delete this stack? This will stop and remove its containers.')) {
                      const removeVolumes = confirm('Do you also want to remove persistent volumes attached to this stack?');
                      deleteMutation.mutate({ name: stackDetails.name, removeVolumes });
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-semibold transition-all cursor-pointer border border-red-500/25"
                  title="Remove stack configuration and services"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Services & Container Listing */}
              <div className="lg:col-span-5 space-y-6">
                <div className="flex justify-between items-center pb-1">
                  <h3 className="text-xs font-bold text-zinc-450 uppercase tracking-wider">Stack Services</h3>
                  <span className="text-[10px] font-mono text-zinc-550 font-bold">{stackDetails.containers?.length || 0} Containers</span>
                </div>

                {stackDetails.containers?.length === 0 ? (
                  <div className="border border-[rgba(255,255,255,0.06)] rounded-xl p-8 text-center text-zinc-550 bg-[#121418]/30 flex flex-col items-center justify-center gap-2">
                    <Server size={20} className="text-zinc-650" />
                    <p className="text-xs">No active containers found.</p>
                    <p className="text-[9px] text-zinc-700 leading-relaxed">Stack configuration is stored, but containers have not been deployed yet. Click "Deploy" to launch.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stackDetails.containers.map((c) => (
                      <Link
                        key={c.id}
                        to={`/containers/${c.id}`}
                        className="block p-4 bg-[#121418]/65 hover:bg-[#181a20] border border-[rgba(255,255,255,0.06)] hover:border-zinc-700 rounded-xl transition-all shadow-sm"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-zinc-250">{c.name}</h4>
                              <span className="text-[9px] font-mono text-zinc-550 bg-[#0B0D10] border border-[rgba(255,255,255,0.04)] px-1.5 py-0.5 rounded uppercase tracking-wider">{c.service}</span>
                            </div>
                            <p className="text-[9px] font-mono text-zinc-550 mt-1 truncate">ID: {c.id.slice(0, 12)}</p>
                          </div>

                          <div className="flex flex-col items-end gap-1 font-sans">
                            <span className={`text-[8px] font-bold px-2 py-0.5 border rounded-full uppercase tracking-wider font-mono ${c.state === 'running' ? 'text-green-400 bg-green-400/5 border-green-500/20' : 'text-zinc-400 bg-zinc-400/5 border-zinc-500/20'}`}>
                              {c.state}
                            </span>
                            <span className="text-[8px] text-zinc-550 truncate max-w-[120px]" title={c.status}>{c.status}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Combined Logs Terminal Console */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex border-b border-[rgba(255,255,255,0.06)]">
                  <button
                    onClick={() => setActiveConsoleTab('deploy')}
                    className={`px-5 py-2 text-xs font-bold tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                      activeConsoleTab === 'deploy'
                        ? 'border-indigo-500 text-white'
                        : 'border-transparent text-zinc-500 hover:text-zinc-350'
                    }`}
                  >
                    <Terminal size={12} /> Deployment Output
                  </button>
                  <button
                    onClick={() => setActiveConsoleTab('container')}
                    className={`px-5 py-2 text-xs font-bold tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                      activeConsoleTab === 'container'
                        ? 'border-indigo-500 text-white'
                        : 'border-transparent text-zinc-500 hover:text-zinc-350'
                    }`}
                  >
                    <Activity size={12} /> Live Container Logs
                  </button>
                </div>

                {/* Console Output Screen */}
                <div className="p-4 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl h-[360px] overflow-y-auto font-mono text-[10px] text-zinc-400 leading-relaxed shadow-inner">
                  {activeConsoleTab === 'deploy' ? (
                    <div className="space-y-0.5">
                      {deploymentLogs.length === 0 ? (
                        <p className="text-zinc-650 italic">No output recorded. Operations logs will print here during action executions.</p>
                      ) : (
                        deploymentLogs.map((log, index) => (
                          <div key={index} className="whitespace-pre-wrap font-mono">
                            {log}
                          </div>
                        ))
                      )}
                      <div ref={deployTerminalEndRef} />
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {containerLogs.length === 0 ? (
                        <p className="text-zinc-650 italic">Waiting for combined service log stream... Deploy stack and start containers to activate feed.</p>
                      ) : (
                        containerLogs.map((log, index) => (
                          <div key={index} className="whitespace-pre-wrap font-mono">
                            {log}
                          </div>
                        ))
                      )}
                      <div ref={containerTerminalEndRef} />
                    </div>
                  )}
                </div>
              </div>

            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </motion.div>
  );
};
export default Stacks;
