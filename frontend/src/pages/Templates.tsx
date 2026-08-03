import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Settings2,
  Play,
  Layers,
  Database,
  Globe,
  Lock,
  Cpu,
  Server,
  FileCode,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TemplateDef {
  id: string;
  name: string;
  category: 'Database' | 'Web' | 'DevOps' | 'App';
  description: string;
  icon: any;
  defaultPorts: { name: string; host: number; container: number }[];
  defaultVolumes: { name: string; volumeName: string; containerPath: string }[];
  defaultEnv: { key: string; value: string; description: string }[];
  generateYaml: (config: {
    stackName: string;
    ports: Record<string, number>;
    volumes: Record<string, string>;
    env: Record<string, string>;
  }) => string;
}

const APP_TEMPLATES: TemplateDef[] = [
  {
    id: 'nginx',
    name: 'Nginx Web Server',
    category: 'Web',
    description: 'High-performance HTTP server and reverse proxy.',
    icon: Globe,
    defaultPorts: [{ name: 'HTTP Web Port', host: 8080, container: 80 }],
    defaultVolumes: [],
    defaultEnv: [],
    generateYaml: ({ ports }) => `version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "${ports['HTTP Web Port']}:80"
    restart: always
`
  },
  {
    id: 'redis',
    name: 'Redis Cache',
    category: 'Database',
    description: 'In-memory key-value database, cache, and message broker.',
    icon: Cpu,
    defaultPorts: [{ name: 'Redis Server Port', host: 6379, container: 6379 }],
    defaultVolumes: [{ name: 'Redis Persistent Volume', volumeName: 'redis_data', containerPath: '/data' }],
    defaultEnv: [],
    generateYaml: ({ ports, volumes }) => `version: '3.8'
services:
  cache:
    image: redis:alpine
    command: redis-server --appendonly yes
    ports:
      - "${ports['Redis Server Port']}:6379"
    volumes:
      - ${volumes['Redis Persistent Volume']}:/data
    restart: always
volumes:
  ${volumes['Redis Persistent Volume']}:
`
  },
  {
    id: 'postgres',
    name: 'PostgreSQL DB',
    category: 'Database',
    description: 'Powerful, open-source object-relational database system.',
    icon: Database,
    defaultPorts: [{ name: 'Postgres Connection Port', host: 5432, container: 5432 }],
    defaultVolumes: [{ name: 'Postgres Data Storage', volumeName: 'pg_data', containerPath: '/var/lib/postgresql/data' }],
    defaultEnv: [
      { key: 'POSTGRES_USER', value: 'postgres', description: 'Database Superuser Username' },
      { key: 'POSTGRES_PASSWORD', value: 'secretpass', description: 'Database Password' },
      { key: 'POSTGRES_DB', value: 'dockops_db', description: 'Default Database Name' },
    ],
    generateYaml: ({ ports, volumes, env }) => `version: '3.8'
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: "${env['POSTGRES_USER']}"
      POSTGRES_PASSWORD: "${env['POSTGRES_PASSWORD']}"
      POSTGRES_DB: "${env['POSTGRES_DB']}"
    ports:
      - "${ports['Postgres Connection Port']}:5432"
    volumes:
      - ${volumes['Postgres Data Storage']}:/var/lib/postgresql/data
    restart: always
volumes:
  ${volumes['Postgres Data Storage']}:
`
  },
  {
    id: 'wordpress',
    name: 'WordPress Blog',
    category: 'App',
    description: 'Web publishing platform backed by a MySQL database.',
    icon: Server,
    defaultPorts: [{ name: 'WordPress HTTP Port', host: 8000, container: 80 }],
    defaultVolumes: [
      { name: 'WordPress Static Data', volumeName: 'wp_files', containerPath: '/var/www/html' },
      { name: 'MySQL DB Storage', volumeName: 'wp_db_data', containerPath: '/var/lib/mysql' },
    ],
    defaultEnv: [
      { key: 'MYSQL_PASSWORD', value: 'wordpresspwd', description: 'MySQL User Password' },
      { key: 'MYSQL_ROOT_PASSWORD', value: 'rootdbpassword', description: 'MySQL Root Password' },
    ],
    generateYaml: ({ ports, volumes, env }) => `version: '3.8'
services:
  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: "${env['MYSQL_ROOT_PASSWORD']}"
      MYSQL_DATABASE: "wordpress"
      MYSQL_USER: "wordpress"
      MYSQL_PASSWORD: "${env['MYSQL_PASSWORD']}"
    volumes:
      - ${volumes['MySQL DB Storage']}:/var/lib/mysql
    restart: always

  wordpress:
    depends_on:
      - db
    image: wordpress:latest
    ports:
      - "${ports['WordPress HTTP Port']}:80"
    environment:
      WORDPRESS_DB_HOST: db:3306
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: "${env['MYSQL_PASSWORD']}"
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - ${volumes['WordPress Static Data']}:/var/www/html
    restart: always

volumes:
  ${volumes['MySQL DB Storage']}:
  ${volumes['WordPress Static Data']}:
`
  },
  {
    id: 'vault',
    name: 'HashiCorp Vault',
    category: 'DevOps',
    description: 'Secure, store and tightly control access to tokens, passwords, and certificates.',
    icon: Lock,
    defaultPorts: [{ name: 'Vault Web Panel Port', host: 8200, container: 8200 }],
    defaultVolumes: [],
    defaultEnv: [{ key: 'VAULT_DEV_ROOT_TOKEN_ID', value: 'dev_root_token', description: 'Dev Mode Administrative root token ID' }],
    generateYaml: ({ ports, env }) => `version: '3.8'
services:
  vault:
    image: hashicorp/vault:latest
    environment:
      VAULT_DEV_ROOT_TOKEN_ID: "${env['VAULT_DEV_ROOT_TOKEN_ID']}"
      VAULT_DEV_LISTEN_ADDRESS: "0.0.0.0:8200"
    ports:
      - "${ports['Vault Web Panel Port']}:8200"
    cap_add:
      - IPC_LOCK
    restart: always
`
  }
];

export const Templates: React.FC = () => {
  const navigate = useNavigate();
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDef | null>(null);

  // Wizard input state mappings
  const [stackName, setStackName] = useState('');
  const [portsConfig, setPortsConfig] = useState<Record<string, number>>({});
  const [volumesConfig, setVolumesConfig] = useState<Record<string, string>>({});
  const [envConfig, setEnvConfig] = useState<Record<string, string>>({});
  
  const [wizardError, setWizardError] = useState<string | null>(null);

  const deployTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) return;
      
      const generatedYaml = selectedTemplate.generateYaml({
        stackName,
        ports: portsConfig,
        volumes: volumesConfig,
        env: envConfig,
      });

      // 1. Save Stack to DB and disk CWD
      await api.post('/stacks', { name: stackName, yamlContent: generatedYaml });
      
      // 2. Trigger deployment background pipeline
      await api.post(`/stacks/${stackName}/deploy`);
      
      return stackName;
    },
    onSuccess: () => {
      // Navigate to Compose Stacks page to view logs output
      navigate('/stacks');
    },
    onError: (err: any) => {
      setWizardError(err.message || 'Deployment of template failed');
    },
  });

  const selectTemplate = (tpl: TemplateDef) => {
    setSelectedTemplate(tpl);
    setStackName(tpl.id);
    setWizardError(null);

    // Populate default configurations
    const ports: Record<string, number> = {};
    tpl.defaultPorts.forEach((p) => {
      ports[p.name] = p.host;
    });
    setPortsConfig(ports);

    const volumes: Record<string, string> = {};
    tpl.defaultVolumes.forEach((v) => {
      volumes[v.name] = v.volumeName;
    });
    setVolumesConfig(volumes);

    const envs: Record<string, string> = {};
    tpl.defaultEnv.forEach((e) => {
      envs[e.key] = e.value;
    });
    setEnvConfig(envs);
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
        {!selectedTemplate && (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Title */}
            <div className="pb-4 border-b border-[rgba(255,255,255,0.06)]">
              <h1 className="text-3xl font-extrabold tracking-tight text-white leading-none">
                Application Catalog
              </h1>
              <p className="text-xs text-zinc-400 mt-2 font-medium">
                One-click templates to deploy databases, caches, and web tools without typing CLI commands.
              </p>
            </div>

            {/* Grid of templates */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {APP_TEMPLATES.map((tpl) => {
                const Icon = tpl.icon;
                return (
                  <motion.div
                    key={tpl.id}
                    whileHover={{ y: -2 }}
                    onClick={() => selectTemplate(tpl)}
                    className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] hover:border-zinc-700 rounded-xl cursor-pointer transition-all flex flex-col justify-between h-44 shadow-sm"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                          <Icon size={16} />
                        </div>
                        <div>
                          <h3 className="text-xs font-bold text-zinc-200">{tpl.name}</h3>
                          <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest block mt-0.5">{tpl.category}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2">
                        {tpl.description}
                      </p>
                    </div>

                    <div className="text-[9px] font-bold text-indigo-400 hover:underline pt-2 border-t border-white/[0.04] text-right">
                      Configure template &rarr;
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* WIZARD VIEW */}
        {selectedTemplate && (
          <motion.div
            key="wizard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4 pb-4 border-b border-[rgba(255,255,255,0.06)]">
              <button
                onClick={() => setSelectedTemplate(null)}
                className="p-2 border border-[rgba(255,255,255,0.08)] bg-[#121418] hover:bg-[#181a20] rounded-xl text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
              </button>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white leading-none">
                  Configure {selectedTemplate.name}
                </h1>
                <p className="text-[10px] text-zinc-500 mt-1.5 uppercase font-bold tracking-wider">
                  Deployment Parameter Setup
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Form Input fields */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* General Settings */}
                <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl space-y-4 shadow-sm">
                  <h3 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-2">
                    <Settings2 size={14} className="text-indigo-400" /> Stack Details
                  </h3>
                  <div className="space-y-2 font-semibold">
                    <label className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider block">Stack Deployment Name</label>
                    <input
                      type="text"
                      value={stackName}
                      onChange={(e) => setStackName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                      placeholder="e.g. pg-stack"
                      className="w-full px-4 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-zinc-350 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                </div>

                {/* Ports Configurations */}
                {selectedTemplate.defaultPorts.length > 0 && (
                  <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl space-y-4 shadow-sm">
                    <h3 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-2">
                      <Globe size={14} className="text-pink-400" /> Port Mappings
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedTemplate.defaultPorts.map((p) => (
                        <div key={p.name} className="space-y-1.5 font-semibold">
                          <label className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider block">{p.name} (Host)</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={portsConfig[p.name] || p.host}
                              onChange={(e) =>
                                setPortsConfig((prev) => ({ ...prev, [p.name]: Number(e.target.value) }))
                              }
                              className="w-24 px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-zinc-350 focus:outline-none focus:border-zinc-700 text-center"
                            />
                            <span className="text-zinc-550 text-[10px]">&rarr; mapped to container port {p.container}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Volumes Configurations */}
                {selectedTemplate.defaultVolumes.length > 0 && (
                  <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl space-y-4 shadow-sm">
                    <h3 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-2">
                      <Layers size={14} className="text-green-400" /> Volume Bindings
                    </h3>
                    <div className="space-y-4">
                      {selectedTemplate.defaultVolumes.map((v) => (
                        <div key={v.name} className="space-y-1.5 font-semibold">
                          <label className="text-[9px] font-bold text-zinc-555 uppercase tracking-wider block">{v.name} (Docker Volume Name)</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={volumesConfig[v.name] || v.volumeName}
                              onChange={(e) =>
                                setVolumesConfig((prev) => ({ ...prev, [v.name]: e.target.value }))
                              }
                              className="flex-1 px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-zinc-350 focus:outline-none focus:border-zinc-700"
                            />
                            <span className="text-zinc-550 text-[10px] shrink-0">&rarr; mounts to {v.containerPath}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Environment variables Configurations */}
                {selectedTemplate.defaultEnv.length > 0 && (
                  <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl space-y-4 shadow-sm">
                    <h3 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-2">
                      <FileCode size={14} className="text-yellow-400" /> Environment Configurations
                    </h3>
                    <div className="space-y-4">
                      {selectedTemplate.defaultEnv.map((e) => (
                        <div key={e.key} className="space-y-1.5 font-semibold">
                          <div className="flex justify-between">
                            <label className="text-[9px] font-bold text-zinc-555 uppercase tracking-wider block">{e.key}</label>
                            <span className="text-[8px] text-zinc-650 font-normal">{e.description}</span>
                          </div>
                          <input
                            type="text"
                            value={envConfig[e.key] || e.value}
                            onChange={(event) =>
                              setEnvConfig((prev) => ({ ...prev, [e.key]: event.target.value }))
                            }
                            className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg text-xs text-zinc-350 focus:outline-none focus:border-zinc-700 font-mono"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* Sidebar Action Column */}
              <div className="lg:col-span-4 space-y-6">
                <div className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl space-y-4 shadow-sm">
                  <h3 className="text-xs font-bold text-zinc-355 uppercase tracking-wider flex items-center gap-2">
                    <Play size={13} className="text-green-400" /> Actions Panel
                  </h3>
                  
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Once clicked, DockOps will generate a standard Compose file on disk and initialize deployment. You will be redirected to the Stacks log feed.
                  </p>

                  {wizardError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-2 text-red-400 text-[10px]">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <span>{wizardError}</span>
                    </div>
                  )}

                  <button
                    onClick={() => deployTemplateMutation.mutate()}
                    disabled={deployTemplateMutation.isPending || !stackName}
                    className="w-full py-2.5 bg-white hover:bg-zinc-200 disabled:bg-zinc-900 text-zinc-950 disabled:text-zinc-550 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                  >
                    {deployTemplateMutation.isPending ? 'Deploying...' : 'Deploy Stack'}
                  </button>
                </div>
              </div>

            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </motion.div>
  );
};

export default Templates;
