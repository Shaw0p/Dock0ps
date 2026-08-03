document.addEventListener('DOMContentLoaded', () => {
  
  // -- Template Definitions --
  const templates = {
    nginx: {
      name: 'Stack: nginx-web',
      yaml: `version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    restart: always`,
      logs: [
        '[DockOps] Initializing configuration parser...',
        '[DockOps] Spawning validation check: docker compose config',
        '[DockOps] Config signature valid. Spawning container build...',
        '[DockOps] exec: docker compose up -d',
        'Creating network "nginx-web_default" with driver "bridge"',
        'Pulling web (nginx:alpine)...',
        'alpine: Pulling from library/nginx',
        'Digest: sha256:d8c07e0c4b2b0df91b7d5ec...',
        'Status: Downloaded newer image for nginx:alpine',
        'Creating nginx-web-web-1 ... done',
        '[DockOps] Stack nginx-web is up. Status: RUNNING',
        'nginx-web-web-1 | 172.20.0.1 - - [03/Aug/2026:13:58:35] "GET / HTTP/1.1" 200 615 "-" "Mozilla/5.0"'
      ]
    },
    postgres: {
      name: 'Stack: postgres-db',
      yaml: `version: '3.8'
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secretpassword
      POSTGRES_DB: userdb
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
    restart: always

volumes:
  pg_data:`,
      logs: [
        '[DockOps] Initializing configuration parser...',
        '[DockOps] Spawning validation check: docker compose config',
        '[DockOps] Config signature valid. Spawning container build...',
        '[DockOps] exec: docker compose up -d',
        'Creating volume "postgres-db_pg_data" with local driver',
        'Creating postgres-db-db-1 ... done',
        '[DockOps] Stack postgres-db is up. Status: RUNNING',
        'postgres-db-db-1 | PostdB init: Database system is ready to accept connections',
        'postgres-db-db-1 | PostdB init: Database "userdb" initialized for user "admin"',
        'postgres-db-db-1 | PostdB init: Server started on port 5432'
      ]
    }
  };

  // -- Element References --
  const tabBtnNginx = document.getElementById('tab-btn-nginx');
  const tabBtnPostgres = document.getElementById('tab-btn-postgres');
  const editorCode = document.getElementById('editor-code');
  
  const workbenchStatusText = document.getElementById('workbench-status-text');
  const workbenchStatusDot = document.getElementById('workbench-status-dot');
  const workbenchStackName = document.getElementById('workbench-stack-name');
  
  const visualNginx = document.getElementById('visual-nginx');
  const visualPostgres = document.getElementById('visual-postgres');
  const sandboxLogs = document.getElementById('sandbox-logs');
  
  const btnDeploySim = document.getElementById('btn-deploy-sim');
  const btnCrashSim = document.getElementById('btn-crash-sim');
  
  const nginxContainerBox = document.getElementById('nginx-container-box');
  const nginxContainerBadge = document.getElementById('nginx-container-badge');
  const postgresContainerBox = document.getElementById('postgres-container-box');
  const postgresContainerBadge = document.getElementById('postgres-container-badge');
  
  const webhookToast = document.getElementById('webhook-toast');
  const webhookToastMessage = document.getElementById('webhook-toast-message');
  const webhookToastClose = document.getElementById('webhook-toast-close');
  
  const copyBtn = document.getElementById('copy-btn');
  const codeSnippet = document.getElementById('code-snippet');

  let activeTabKey = 'nginx';
  let logIntervalId = null;
  let isCrashed = false;

  // -- Simulation Log Scroller --
  function runLogSimulation(logArray, onComplete = null) {
    if (logIntervalId) clearInterval(logIntervalId);
    sandboxLogs.innerHTML = '';
    
    let index = 0;
    
    // Set status to deploying
    workbenchStatusText.textContent = 'Deploying Stack...';
    workbenchStatusDot.className = 'w-2 h-2 rounded-full bg-[#EA580C] animate-pulse';

    function addNextLog() {
      if (index < logArray.length) {
        const p = document.createElement('p');
        p.className = 'animate-hydraulic';
        
        const text = logArray[index];
        if (text.includes('[DockOps]')) {
          p.innerHTML = `<span class="text-[#0284C7]">[DockOps]</span> ${text.replace('[DockOps]', '')}`;
        } else if (text.includes('Creating') || text.includes('done') || text.includes('ready') || text.includes('initialized')) {
          p.innerHTML = `<span class="text-[#059669]">${text}</span>`;
        } else if (text.includes('Error') || text.includes('exited') || text.includes('alert')) {
          p.innerHTML = `<span class="text-[#EA580C] font-bold">${text}</span>`;
        } else {
          p.textContent = text;
        }
        
        sandboxLogs.appendChild(p);
        sandboxLogs.scrollTop = sandboxLogs.scrollHeight;
        index++;
      } else {
        clearInterval(logIntervalId);
        workbenchStatusText.textContent = 'Stack Deployed';
        workbenchStatusDot.className = 'w-2 h-2 rounded-full bg-[#059669] animate-pulse';
        if (onComplete) onComplete();
      }
    }

    addNextLog();
    logIntervalId = setInterval(addNextLog, 400);
  }

  // -- Tab Selection Handler --
  function selectTab(key) {
    activeTabKey = key;
    isCrashed = false;
    resetContainerStates();
    dismissToast();

    // Reset crash button state
    btnCrashSim.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Inject Container Crash';
    btnCrashSim.className = 'px-3.5 py-1.5 bg-[#EA580C]/20 hover:bg-[#EA580C]/35 border border-[#EA580C]/30 text-[#EA580C] rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5';

    const data = templates[key];
    if (!data) return;

    if (key === 'nginx') {
      tabBtnNginx.className = 'px-4 py-3 text-[10px] font-mono font-bold tracking-wider transition-all border-r border-white/[0.04] flex items-center gap-2 cursor-pointer text-[#0284C7] bg-[#1E293B]';
      tabBtnPostgres.className = 'px-4 py-3 text-[10px] font-mono font-bold tracking-wider transition-all border-r border-white/[0.04] flex items-center gap-2 cursor-pointer text-[#64748B] hover:text-[#94A3B8]';
      
      visualNginx.classList.remove('hidden');
      visualPostgres.classList.add('hidden');
    } else {
      tabBtnPostgres.className = 'px-4 py-3 text-[10px] font-mono font-bold tracking-wider transition-all border-r border-white/[0.04] flex items-center gap-2 cursor-pointer text-[#0284C7] bg-[#1E293B]';
      tabBtnNginx.className = 'px-4 py-3 text-[10px] font-mono font-bold tracking-wider transition-all border-r border-white/[0.04] flex items-center gap-2 cursor-pointer text-[#64748B] hover:text-[#94A3B8]';
      
      visualPostgres.classList.remove('hidden');
      visualNginx.classList.add('hidden');
    }

    editorCode.textContent = data.yaml;
    workbenchStackName.textContent = data.name;

    runLogSimulation(data.logs);
  }

  // -- Deploy Button Simulation --
  if (btnDeploySim) {
    btnDeploySim.addEventListener('click', () => {
      // Toggle button visual state
      btnDeploySim.disabled = true;
      btnDeploySim.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin"></i> Deploying...';
      
      isCrashed = false;
      resetContainerStates();
      dismissToast();

      // Reset crash button
      btnCrashSim.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Inject Container Crash';
      btnCrashSim.className = 'px-3.5 py-1.5 bg-[#EA580C]/20 hover:bg-[#EA580C]/35 border border-[#EA580C]/30 text-[#EA580C] rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5';

      const data = templates[activeTabKey];
      runLogSimulation(data.logs, () => {
        btnDeploySim.disabled = false;
        btnDeploySim.innerHTML = '<i class="fa-solid fa-rocket"></i> Deploy Compose Stack';
        
        // Brief success flash
        const originalBg = btnDeploySim.style.backgroundColor;
        btnDeploySim.style.backgroundColor = '#059669';
        setTimeout(() => {
          btnDeploySim.style.backgroundColor = originalBg;
        }, 1200);
      });
    });
  }

  // -- Crash Simulation Handler --
  if (btnCrashSim) {
    btnCrashSim.addEventListener('click', () => {
      if (!isCrashed) {
        // Trigger Crash State
        isCrashed = true;
        
        // Update visual containers styles
        if (activeTabKey === 'nginx') {
          nginxContainerBox.className = 'w-48 p-4 bg-[#0F172A] border-2 border-[#EA580C] rounded-2xl flex flex-col items-center gap-2 shadow-lg transform transition-all duration-500 scale-95';
          nginxContainerBadge.className = 'text-[8px] font-mono text-[#EA580C] bg-[#EA580C]/10 border border-[#EA580C]/20 px-1.5 py-0.5 rounded font-bold uppercase';
          nginxContainerBadge.textContent = 'CRASHED (Exit 137)';
        } else {
          postgresContainerBox.className = 'w-44 p-4 bg-[#0F172A] border-2 border-[#EA580C] rounded-2xl flex flex-col items-center gap-2 shadow-lg transition-all duration-500 scale-95';
          postgresContainerBadge.className = 'text-[8.5px] font-mono text-[#EA580C] bg-[#EA580C]/10 border border-[#EA580C]/20 px-1.5 py-0.5 rounded font-bold uppercase';
          postgresContainerBadge.textContent = 'CRASHED (Exit 137)';
        }

        // Output error logs
        const errorLogs = [
          `[DockOps] Warning: Container status changed inside node daemon`,
          `[DockOps] Error: service "${activeTabKey === 'nginx' ? 'web' : 'db'}" exited unexpectedly with status code 137`,
          `[DockOps] Rules engine evaluation: Alert rule "High Resource Kill" matched`,
          `[DockOps] Dispatched Discord webhook payload to alerting endpoint...`
        ];
        
        runLogSimulation(errorLogs, () => {
          workbenchStatusText.textContent = 'Status Warning';
          workbenchStatusDot.className = 'w-2 h-2 rounded-full bg-[#EA580C] animate-pulse';
        });

        // Show Toast popup
        webhookToastMessage.textContent = `Alert: Container "${activeTabKey === 'nginx' ? 'nginx-web' : 'postgres-db'}" exited unexpectedly!`;
        webhookToast.classList.remove('hidden');
        setTimeout(() => {
          webhookToast.style.opacity = '1';
          webhookToast.style.transform = 'scale(1)';
        }, 100);

        // Change button to recover state
        btnCrashSim.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Restart & Recover Container';
        btnCrashSim.className = 'px-3.5 py-1.5 bg-[#059669] hover:bg-[#047857] text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5';
      } else {
        // Recover State
        isCrashed = false;
        resetContainerStates();
        dismissToast();

        // Print recovery logs
        const recoveryLogs = [
          `[DockOps] Spawning recovery restart on container...`,
          `[DockOps] exec: docker restart ${activeTabKey === 'nginx' ? 'nginx-web-web-1' : 'postgres-db-db-1'}`,
          `[DockOps] Container restarted successfully. Status: RUNNING`,
          `[DockOps] Outbound webhook resolved notification dispatched...`
        ];

        runLogSimulation(recoveryLogs, () => {
          workbenchStatusText.textContent = 'Stack Deployed';
          workbenchStatusDot.className = 'w-2 h-2 rounded-full bg-[#059669] animate-pulse';
        });

        // Reset crash button
        btnCrashSim.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Inject Container Crash';
        btnCrashSim.className = 'px-3.5 py-1.5 bg-[#EA580C]/20 hover:bg-[#EA580C]/35 border border-[#EA580C]/30 text-[#EA580C] rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5';
      }
    });
  }

  // -- Helper functions --
  function resetContainerStates() {
    nginxContainerBox.className = 'w-48 p-4 bg-[#0F172A] border-2 border-[#0284C7] rounded-2xl flex flex-col items-center gap-2 shadow-lg transform transition-all duration-500 scale-100';
    nginxContainerBadge.className = 'text-[8px] font-mono text-[#059669] bg-[#059669]/10 border border-[#059669]/20 px-1.5 py-0.5 rounded font-bold uppercase';
    nginxContainerBadge.textContent = 'Active';

    postgresContainerBox.className = 'w-44 p-4 bg-[#0F172A] border-2 border-[#0284C7] rounded-2xl flex flex-col items-center gap-2 shadow-lg transition-all duration-500 scale-100';
    postgresContainerBadge.className = 'text-[8.5px] font-mono text-[#059669] bg-[#059669]/10 border border-[#059669]/20 px-1.5 py-0.5 rounded font-bold uppercase';
    postgresContainerBadge.textContent = 'Active';
  }

  function dismissToast() {
    webhookToast.style.opacity = '0';
    webhookToast.style.transform = 'scale(0.95)';
    setTimeout(() => {
      webhookToast.classList.add('hidden');
    }, 300);
  }

  if (webhookToastClose) {
    webhookToastClose.addEventListener('click', dismissToast);
  }

  // -- Tab switches listeners --
  if (tabBtnNginx) tabBtnNginx.addEventListener('click', () => selectTab('nginx'));
  if (tabBtnPostgres) tabBtnPostgres.addEventListener('click', () => selectTab('postgres'));

  // Copy Snippet Handler
  if (copyBtn && codeSnippet) {
    copyBtn.addEventListener('click', () => {
      const text = codeSnippet.textContent.trim();
      navigator.clipboard.writeText(text)
        .then(() => {
          const icon = copyBtn.querySelector('i');
          if (icon) {
            icon.className = 'fa-solid fa-check text-[#059669]';
            setTimeout(() => {
              icon.className = 'fa-solid fa-copy text-[10px]';
            }, 2000);
          }
        })
        .catch(err => console.error('Failed to copy: ', err));
    });
  }

  // Initialize Nginx tab on load
  selectTab('nginx');
});
