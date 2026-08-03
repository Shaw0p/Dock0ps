import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
  Bell,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  Settings,
  Activity,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AlertRule {
  id: string;
  name: string;
  metric: 'CPU' | 'MEMORY' | 'STATUS' | 'DISK';
  condition: '>' | '<' | '==';
  value: number;
  enabled: boolean;
  channel: 'SLACK' | 'DISCORD';
  webhookUrl?: string;
  createdAt: string;
}

interface AlertHistoryItem {
  id: string;
  containerId: string;
  containerName: string;
  ruleName?: string;
  message: string;
  status: 'TRIGGERED' | 'RESOLVED';
  createdAt: string;
}

export const Alerts: React.FC = () => {
  const queryClient = useQueryClient();

  // Rules form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleMetric, setRuleMetric] = useState<'CPU' | 'MEMORY' | 'STATUS'>('CPU');
  const [ruleCondition, setRuleCondition] = useState<'>' | '<' | '=='>('>');
  const [ruleValue, setRuleValue] = useState<number>(80);
  const [ruleChannel, setRuleChannel] = useState<'SLACK' | 'DISCORD'>('SLACK');
  const [ruleWebhookUrl, setRuleWebhookUrl] = useState('');
  
  const [formError, setFormError] = useState<string | null>(null);

  // Queries
  const { data: rules = [], isLoading: isRulesLoading } = useQuery<AlertRule[]>({
    queryKey: ['alertRules'],
    queryFn: () => api.get('/alerts/rules'),
    refetchInterval: 10000,
  });

  const { data: history = [], isLoading: isHistoryLoading } = useQuery<AlertHistoryItem[]>({
    queryKey: ['alertHistory'],
    queryFn: () => api.get('/alerts/history'),
    refetchInterval: 5000,
  });

  // Mutations
  const saveRuleMutation = useMutation({
    mutationFn: (body: any) => api.post('/alerts/rules', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
      setShowAddForm(false);
      setRuleName('');
      setRuleWebhookUrl('');
      setFormError(null);
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to save alerting rule');
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: (rule: AlertRule) =>
      api.post('/alerts/rules', { ...rule, enabled: !rule.enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/alerts/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertRules'] });
    },
  });

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName) {
      setFormError('Rule name is required');
      return;
    }
    saveRuleMutation.mutate({
      name: ruleName,
      metric: ruleMetric,
      condition: ruleCondition,
      value: ruleMetric === 'STATUS' ? 0 : Number(ruleValue),
      channel: ruleChannel,
      webhookUrl: ruleWebhookUrl || undefined,
    });
  };

  const getMetricLabel = (metric: string, condition: string, value: number) => {
    if (metric === 'STATUS') {
      return 'Container state is Stopped (exited/dead)';
    }
    return `${metric} utilization is ${condition} ${value}%`;
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-2 border-b border-[rgba(255,255,255,0.06)]">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white leading-none flex items-center gap-3">
            Alerting Rules & Webhooks
          </h1>
          <p className="text-xs text-zinc-400 mt-2 font-medium">
            Monitor container performance and get instant Slack/Discord webhook alerts when thresholds are breached.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="self-start sm:self-center px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-950 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          <Plus size={13} /> {showAddForm ? 'Cancel' : 'New Alert Rule'}
        </button>
      </div>

      {/* Rules Wizard Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleCreateRule} className="p-6 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl space-y-5 shadow-sm text-xs font-semibold">
              <h3 className="text-xs font-bold text-zinc-350 uppercase tracking-wider flex items-center gap-2">
                <Settings size={14} className="text-indigo-400" /> Configure Rule Parameters
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Rule Name */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider block">Rule Identifier Name</label>
                  <input
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="e.g. Postgres CPU Warning"
                    className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-zinc-700 text-zinc-350"
                  />
                </div>

                {/* Metric Selector */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider block">Operational Metric</label>
                  <select
                    value={ruleMetric}
                    onChange={(e) => {
                      const m = e.target.value as any;
                      setRuleMetric(m);
                      if (m === 'STATUS') {
                        setRuleCondition('==');
                        setRuleValue(0);
                      } else {
                        setRuleCondition('>');
                        setRuleValue(80);
                      }
                    }}
                    className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-zinc-700 text-zinc-300"
                  >
                    <option value="CPU">CPU Utilization (%)</option>
                    <option value="MEMORY">Memory Utilization (%)</option>
                    <option value="STATUS">Stopped Status (State)</option>
                  </select>
                </div>

                {/* Condition & Value */}
                {ruleMetric !== 'STATUS' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider block">Condition</label>
                      <select
                        value={ruleCondition}
                        onChange={(e) => setRuleCondition(e.target.value as any)}
                        className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-zinc-700 text-zinc-350"
                      >
                        <option value=">">exceeds (&gt;)</option>
                        <option value="<">falls below (&lt;)</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider block">Value (%)</label>
                      <input
                        type="number"
                        value={ruleValue}
                        onChange={(e) => setRuleValue(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-zinc-700 text-zinc-350 text-center"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-550 uppercase tracking-wider block">Condition Value</label>
                    <div className="px-3 py-2 bg-zinc-950/20 text-zinc-500 border border-white/[0.04] rounded-lg italic">
                      Trigger when container status is Stopped (exited/dead)
                    </div>
                  </div>
                )}
              </div>

              {/* Webhook Settings */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-zinc-555 uppercase tracking-wider block">Notification Channel</label>
                  <select
                    value={ruleChannel}
                    onChange={(e) => setRuleChannel(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-zinc-700 text-zinc-350"
                  >
                    <option value="SLACK">Slack App Webhook</option>
                    <option value="DISCORD">Discord Channel Webhook</option>
                  </select>
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[9px] font-bold text-zinc-555 uppercase tracking-wider block">Webhook URL</label>
                  <input
                    type="text"
                    value={ruleWebhookUrl}
                    onChange={(e) => setRuleWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/services/... or https://discord.com/api/webhooks/..."
                    className="w-full px-3 py-2 bg-[#0B0D10] border border-[rgba(255,255,255,0.08)] rounded-lg focus:outline-none focus:border-zinc-700 text-zinc-350 font-mono"
                  />
                </div>

              </div>

              {formError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 bg-[#0B0D10] hover:bg-zinc-900 border border-[rgba(255,255,255,0.08)] text-zinc-400 rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveRuleMutation.isPending}
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-950 rounded-xl cursor-pointer transition-colors font-bold"
                >
                  Save Alerting Rule
                </button>
              </div>

            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Rules List (5 columns) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex justify-between items-center pb-1">
            <h3 className="text-xs font-bold text-zinc-450 uppercase tracking-wider">Active Alert Policies</h3>
            <span className="text-[10px] font-mono text-zinc-555 font-bold">{rules.length} Configured</span>
          </div>

          {isRulesLoading ? (
            <div className="h-44 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-zinc-700 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : rules.length === 0 ? (
            <div className="border border-[rgba(255,255,255,0.08)] border-dashed rounded-xl p-12 text-center text-zinc-500 bg-[#121418]/30 flex flex-col items-center justify-center gap-2">
              <Bell size={24} className="text-zinc-750" />
              <p className="text-xs font-semibold text-zinc-400">No alert rules configured.</p>
              <p className="text-[9px] text-zinc-650 max-w-xs leading-relaxed">
                Add rules to monitor CPU/RAM utilization and receive automated Discord/Slack notifications when triggers occur.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-4 bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${rule.enabled ? 'bg-green-500' : 'bg-zinc-650'}`}></span>
                      <h4 className="text-xs font-bold text-zinc-250 truncate" title={rule.name}>{rule.name}</h4>
                    </div>
                    <p className="text-[10px] text-zinc-500 font-semibold mt-1">
                      Target: {getMetricLabel(rule.metric, rule.condition, rule.value)}
                    </p>
                    {rule.webhookUrl && (
                      <span className="inline-flex items-center gap-1 text-[8px] font-mono text-zinc-650 mt-1 uppercase tracking-wider">
                        {rule.channel} Hook Configured
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleRuleMutation.mutate(rule)}
                      className="p-1.5 hover:bg-zinc-900 text-zinc-500 hover:text-white rounded-lg transition-colors cursor-pointer"
                      title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                    >
                      {rule.enabled ? <ToggleRight size={16} className="text-green-400" /> : <ToggleLeft size={16} />}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove alert rule "${rule.name}"?`)) {
                          deleteRuleMutation.mutate(rule.id);
                        }
                      }}
                      className="p-1.5 hover:bg-zinc-900 text-zinc-500 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                      title="Delete rule"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alerts Feed History (7 columns) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex justify-between items-center pb-1">
            <h3 className="text-xs font-bold text-zinc-450 uppercase tracking-wider flex items-center gap-2">
              <Activity size={13} className="text-pink-400" /> Trigger History log
            </h3>
            <span className="text-[10px] font-mono text-zinc-555 font-bold">Latest 50 Entries</span>
          </div>

          {isHistoryLoading ? (
            <div className="h-44 bg-[#121418]/65 border border-[rgba(255,255,255,0.08)] rounded-xl flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-zinc-700 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : history.length === 0 ? (
            <div className="border border-[rgba(255,255,255,0.08)] border-dashed rounded-xl p-12 text-center text-zinc-550 bg-[#121418]/30 flex flex-col items-center justify-center gap-2 h-64">
              <CheckCircle size={24} className="text-zinc-750" />
              <p className="text-xs font-semibold text-zinc-400">All nodes are healthy.</p>
              <p className="text-[9px] text-zinc-650 max-w-xs leading-relaxed">
                No alert triggers or resolution notices have been logged.
              </p>
            </div>
          ) : (
            <div className="bg-[#121418]/65 border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden divide-y divide-white/[0.04] max-h-[500px] overflow-y-auto shadow-sm no-scrollbar">
              {history.map((item) => (
                <div key={item.id} className="p-4 px-5 flex items-center justify-between gap-4 font-mono text-[10px]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 border rounded uppercase text-[7px] font-bold shrink-0 ${
                        item.status === 'TRIGGERED'
                          ? 'text-red-400 bg-red-500/10 border-red-500/20'
                          : 'text-green-400 bg-green-500/10 border-green-500/20'
                      }`}>
                        {item.status}
                      </span>
                      <span className="text-zinc-300 font-semibold">{item.message}</span>
                    </div>
                    {item.ruleName && (
                      <p className="text-zinc-550 text-[8px] mt-1 font-sans">Triggered by rule: {item.ruleName}</p>
                    )}
                  </div>

                  <span className="text-zinc-600 font-bold shrink-0 text-[8.5px]">
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </motion.div>
  );
};

export default Alerts;
