import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, X, Shield, BookOpen, Heart, User, CheckCircle, Boxes, Cpu, HardDrive } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  // Authentication states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Overlay states: 'login' | 'goal' | 'resources' | 'contact' | 'home' | null
  const [activeOverlay, setActiveOverlay] = useState<'login' | 'goal' | 'resources' | 'contact' | 'home' | null>('login');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterRedirect = () => {
    navigate('/register');
  };

  return (
    <div 
      className="min-h-screen bg-cover bg-center flex flex-col justify-between relative overflow-hidden font-sans select-none"
      style={{ backgroundImage: "url('/login_bg.png')" }}
    >
      {/* Top Navbar */}
      <header className="w-full h-20 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between px-12 z-20">
        <div className="flex items-center gap-10">
          {/* Logo brand */}
          <span className="font-extrabold text-sm tracking-wider text-white">DOCKOPS</span>
          
          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-8 text-[11px] font-bold text-zinc-350">
            <button 
              onClick={() => setActiveOverlay('home')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Home
            </button>
            <button 
              onClick={() => setActiveOverlay('goal')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Our Goal
            </button>
            <button 
              onClick={() => setActiveOverlay('resources')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              DevOps Resources
            </button>
            <button 
              onClick={() => setActiveOverlay('contact')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Contacts
            </button>
          </nav>
        </div>

        {/* Auth Buttons */}
        <div className="flex items-center gap-4">
          <button 
            onClick={handleRegisterRedirect}
            className="px-5 py-2 border border-[rgba(255,255,255,0.15)] hover:border-zinc-400 text-xs font-bold rounded-full transition-all cursor-pointer text-white bg-transparent"
          >
            Sign Up
          </button>
          <button 
            onClick={() => setActiveOverlay('login')}
            className="px-5 py-2 bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold rounded-full transition-all cursor-pointer shadow-md"
          >
            Log In
          </button>
        </div>
      </header>

      {/* Center Layout */}
      <main className="flex-1 flex items-center justify-center p-6 relative z-10">
        <AnimatePresence mode="wait">
          
          {/* Hero Landing text (No active overlay) */}
          {activeOverlay === null && (
            <motion.div 
              key="hero"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="text-center max-w-2xl space-y-6 flex flex-col items-center"
            >
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
                Boost your container workflows with stunning control consoles!
              </h1>
              <p className="text-zinc-400 text-xs md:text-sm max-w-lg leading-relaxed">
                DockOps connects directly to local engines to monitor running resources, compile filesystem logs, and orchestrate server networks within a single workspace.
              </p>
              
              <div className="flex items-center gap-4 pt-4">
                <button 
                  onClick={() => setActiveOverlay('login')}
                  className="px-6 py-3 bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-bold rounded-full flex items-center gap-2 transition-all cursor-pointer shadow-md"
                >
                  Get started <ArrowRight size={13} />
                </button>
                <button 
                  onClick={() => setActiveOverlay('goal')}
                  className="px-6 py-3 border border-[rgba(255,255,255,0.15)] hover:border-zinc-400 text-xs font-bold rounded-full transition-all cursor-pointer text-white bg-transparent"
                >
                  Learn more
                </button>
              </div>
            </motion.div>
          )}

          {/* Overlay: Login Form */}
          {activeOverlay === 'login' && (
            <motion.div
              key="login-form"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-sm p-8 bg-[#121418]/80 backdrop-blur-xl border border-[rgba(255,255,255,0.08)] rounded-3xl shadow-2xl relative"
            >
              <button 
                onClick={() => setActiveOverlay(null)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="space-y-1 mb-6 text-center">
                <h2 className="text-lg font-bold text-white">Log in to DockOps</h2>
                <p className="text-[11px] text-zinc-500 font-medium">Infrastructure Control Workspace</p>
              </div>

              {error && (
                <div className="mb-4 p-3.5 bg-red-500/10 border border-red-500/20 text-[10px] text-red-400 rounded-lg flex items-center gap-2">
                  <Shield size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="name@company.com"
                    className="w-full px-4 py-2 bg-[#0B0D10]/90 border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-zinc-705"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full px-4 py-2 bg-[#0B0D10]/90 border border-[rgba(255,255,255,0.08)] rounded-xl text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-zinc-705"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-white hover:bg-zinc-200 disabled:bg-zinc-300 text-zinc-950 font-bold rounded-full text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  {isSubmitting ? 'Verifying credentials...' : 'Sign In'}
                  {!isSubmitting && <ArrowRight size={13} />}
                </button>
              </form>

              <p className="mt-6 text-center text-[10px] text-zinc-500 font-semibold">
                Don't have an account?{' '}
                <button 
                  onClick={handleRegisterRedirect} 
                  className="text-zinc-350 hover:text-white hover:underline transition-colors font-bold cursor-pointer"
                >
                  Create account
                </button>
              </p>
            </motion.div>
          )}

          {/* Overlay: Our Goal */}
          {activeOverlay === 'goal' && (
            <motion.div
              key="goal-modal"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-md p-8 bg-[#121418]/85 backdrop-blur-xl border border-[rgba(255,255,255,0.08)] rounded-3xl shadow-2xl relative text-white"
            >
              <button 
                onClick={() => setActiveOverlay(null)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Heart size={16} />
                </div>
                <h3 className="text-base font-bold">Our Goal</h3>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed mb-6">
                To simplify container operations for developers by providing a lightweight, responsive browser console. 
                DockOps aims to bridge local runtimes and multi-cloud architectures without cluttering the screen with unnecessary metrics, putting developer workflow and configuration inspection first.
              </p>

              {/* Animated Cluster Schematic (Architectural flow chart) */}
              <div className="w-full h-36 flex items-center justify-between relative bg-[#0B0D10]/80 border border-[rgba(255,255,255,0.06)] rounded-2xl p-4">
                <div className="flex flex-col items-center gap-1 z-10">
                  <div className="w-8 h-8 border border-[rgba(255,255,255,0.08)] bg-[#121418] rounded-lg flex items-center justify-center text-zinc-400">
                    <Boxes size={14} />
                  </div>
                  <span className="text-[9px] font-semibold text-zinc-500">Gateway</span>
                </div>

                <div className="flex-1 h-0.5 border-t border-dashed border-zinc-800 relative mx-2">
                  <motion.div
                    animate={{ left: ['0%', '100%'] }}
                    transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                    className="absolute -top-0.75 w-1.5 h-1.5 rounded-full bg-indigo-500"
                  />
                </div>

                <div className="flex flex-col items-center gap-1 z-10">
                  <div className="w-9 h-9 border border-zinc-700 bg-[#121418] rounded-xl flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-500/5">
                    <Cpu size={16} />
                  </div>
                  <span className="text-[9px] font-bold text-zinc-300">App Node</span>
                </div>

                <div className="flex-1 h-0.5 border-t border-dashed border-zinc-800 relative mx-2">
                  <motion.div
                    animate={{ left: ['0%', '100%'] }}
                    transition={{ repeat: Infinity, duration: 4, ease: 'linear', delay: 2 }}
                    className="absolute -top-0.75 w-1.5 h-1.5 rounded-full bg-indigo-500"
                  />
                </div>

                <div className="flex flex-col items-center gap-1 z-10">
                  <div className="w-8 h-8 border border-zinc-800 bg-[#121418] rounded-lg flex items-center justify-center text-zinc-400">
                    <HardDrive size={14} />
                  </div>
                  <span className="text-[9px] font-semibold text-zinc-500">Database</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Overlay: DevOps Resources */}
          {activeOverlay === 'resources' && (
            <motion.div
              key="resources-modal"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-md p-8 bg-[#121418]/85 backdrop-blur-xl border border-[rgba(255,255,255,0.08)] rounded-3xl shadow-2xl relative text-white"
            >
              <button 
                onClick={() => setActiveOverlay(null)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <BookOpen size={16} />
                </div>
                <h3 className="text-base font-bold">DevOps Resources</h3>
              </div>

              <div className="space-y-3 text-xs">
                <a 
                  href="https://docs.docker.com" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="block p-3 bg-[#0B0D10]/80 border border-[rgba(255,255,255,0.06)] hover:border-zinc-650 rounded-xl transition-all"
                >
                  <p className="font-bold text-zinc-200">Docker Engine API Docs</p>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">Reference manual for docker remote socket endpoints.</span>
                </a>
                <a 
                  href="https://aws.amazon.com/ecs" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="block p-3 bg-[#0B0D10]/80 border border-[rgba(255,255,255,0.06)] hover:border-zinc-650 rounded-xl transition-all"
                >
                  <p className="font-bold text-zinc-200">AWS ECS Orchestration</p>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">Continuous task scheduling and registry push tutorials.</span>
                </a>
              </div>
            </motion.div>
          )}

          {/* Overlay: Contacts */}
          {activeOverlay === 'contact' && (
            <motion.div
              key="contact-modal"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-sm p-8 bg-[#121418]/85 backdrop-blur-xl border border-[rgba(255,255,255,0.08)] rounded-3xl shadow-2xl relative text-white"
            >
              <button 
                onClick={() => setActiveOverlay(null)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <User size={16} />
                </div>
                <h3 className="text-base font-bold">Contact Developer</h3>
              </div>

              <div className="p-4 bg-[#0B0D10]/80 border border-[rgba(255,255,255,0.06)] rounded-xl text-center space-y-1.5">
                <p className="text-sm font-bold text-zinc-200">Meash</p>
                <p className="text-xs font-mono text-zinc-400">+1 (555) 019-2834</p>
                <span className="text-[9px] text-zinc-600 font-bold block pt-1.5 border-t border-[rgba(255,255,255,0.04)]">DEVELOPER SUPPORT OFFICE</span>
              </div>
            </motion.div>
          )}

          {/* Overlay: Home (Unique Connection details) */}
          {activeOverlay === 'home' && (
            <motion.div
              key="home-modal"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-sm p-8 bg-[#121418]/85 backdrop-blur-xl border border-[rgba(255,255,255,0.08)] rounded-3xl shadow-2xl relative text-white"
            >
              <button 
                onClick={() => setActiveOverlay(null)}
                className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <CheckCircle size={16} />
                </div>
                <h3 className="text-base font-bold">Engine Connection</h3>
              </div>

              <div className="space-y-3 text-xs leading-relaxed text-zinc-350">
                <p>
                  DockOps dynamically binds to local engines:
                </p>
                <ul className="list-disc pl-4 space-y-1 font-mono text-[11px] text-zinc-400">
                  <li>Windows: //./pipe/docker_engine</li>
                  <li>macOS/Linux: /var/run/docker.sock</li>
                </ul>
                <p className="text-[10px] text-zinc-500 border-t border-[rgba(255,255,255,0.04)] pt-3">
                  Please log in to query local engine sockets and start container metrics feeds.
                </p>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Spacer Footer */}
      <footer className="h-10 w-full"></footer>
    </div>
  );
};

export default Login;
