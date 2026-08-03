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
  
  const copyBtn = document.getElementById('copy-btn');
  const codeSnippet = document.getElementById('code-snippet');

  let logIntervalId = null;

  // -- Simulation Log Scroller --
  function runLogSimulation(logArray) {
    if (logIntervalId) clearInterval(logIntervalId);
    sandboxLogs.innerHTML = '';
    
    let index = 0;
    
    // Set deployment status indicators
    workbenchStatusText.textContent = 'Deploying Stack...';
    workbenchStatusDot.className = 'w-2 h-2 rounded-full bg-[#EA580C] animate-pulse';

    function addNextLog() {
      if (index < logArray.length) {
        const p = document.createElement('p');
        p.className = 'animate-hydraulic';
        
        // Style specific log strings
        const text = logArray[index];
        if (text.includes('[DockOps]')) {
          p.innerHTML = `<span class="text-[#0284C7]">[DockOps]</span> ${text.replace('[DockOps]', '')}`;
        } else if (text.includes('Creating') || text.includes('done') || text.includes('ready')) {
          p.innerHTML = `<span class="text-[#059669]">${text}</span>`;
        } else {
          p.textContent = text;
        }
        
        sandboxLogs.appendChild(p);
        sandboxLogs.scrollTop = sandboxLogs.scrollHeight;
        index++;
      } else {
        clearInterval(logIntervalId);
        // Set running state indicator when logs complete
        workbenchStatusText.textContent = 'Stack Deployed';
        workbenchStatusDot.className = 'w-2 h-2 rounded-full bg-[#059669] animate-pulse';
      }
    }

    addNextLog();
    logIntervalId = setInterval(addNextLog, 650);
  }

  // -- Tab Selection Handler --
  function selectTab(key) {
    const data = templates[key];
    if (!data) return;

    // Reset tab active states
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

    // Set YAML text
    editorCode.textContent = data.yaml;
    workbenchStackName.textContent = data.name;

    // Run terminal simulator
    runLogSimulation(data.logs);
  }

  // -- Event Listeners --
  if (tabBtnNginx) tabBtnNginx.addEventListener('click', () => selectTab('nginx'));
  if (tabBtnPostgres) tabBtnPostgres.addEventListener('click', () => selectTab('postgres'));

  // Copy Snippet Clipboard Handler
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
