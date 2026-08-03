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
  const nginxFan = document.getElementById('nginx-fan');
  const nginxLed = document.querySelector('#nginx-container-box .led-indicator');

  const postgresContainerBox = document.getElementById('postgres-container-box');
  const postgresContainerBadge = document.getElementById('postgres-container-badge');
  const postgresFan = document.getElementById('postgres-fan');
  const postgresLed = document.querySelector('#postgres-container-box .led-indicator');

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
    workbenchStatusDot.className = 'status-dot warning animate-pulse';

    function addNextLog() {
      if (index < logArray.length) {
        const p = document.createElement('p');
        p.className = 'animate-hydraulic';
        
        const text = logArray[index];
        if (text.includes('[DockOps]')) {
          p.innerHTML = `<span class="text-[#0284C7]">[DockOps]</span> ${text.replace('[DockOps]', '')}`;
        } else if (text.includes('Creating') || text.includes('done') || text.includes('ready') || text.includes('initialized')) {
          p.innerHTML = `<span class="text-[#059669]">${text}</span>`;
        } else if (text.includes('Error') || text.includes('exited') || text.includes('alert') || text.includes('Warning')) {
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
        workbenchStatusDot.className = 'status-dot healthy';
        if (onComplete) onComplete();
      }
    }

    addNextLog();
    logIntervalId = setInterval(addNextLog, 300);
  }

  // -- Tab Selection Handler --
  function selectTab(key) {
    activeTabKey = key;
    isCrashed = false;
    resetContainerStates();
    dismissToast();

    // Reset crash button state
    btnCrashSim.innerHTML = '<i class="fa-solid fa-burst"></i> Inject Container Crash';
    btnCrashSim.className = 'control-btn btn-orange';

    const data = templates[key];
    if (!data) return;

    if (key === 'nginx') {
      tabBtnNginx.className = 'tab-button active';
      tabBtnPostgres.className = 'tab-button';
      
      visualNginx.classList.remove('hidden');
      visualPostgres.classList.add('hidden');
    } else {
      tabBtnPostgres.className = 'tab-button active';
      tabBtnNginx.className = 'tab-button';
      
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
      btnDeploySim.disabled = true;
      btnDeploySim.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin"></i> Deploying...';
      
      isCrashed = false;
      resetContainerStates();
      dismissToast();

      btnCrashSim.innerHTML = '<i class="fa-solid fa-burst"></i> Inject Container Crash';
      btnCrashSim.className = 'control-btn btn-orange';

      const data = templates[activeTabKey];
      runLogSimulation(data.logs, () => {
        btnDeploySim.disabled = false;
        btnDeploySim.innerHTML = '<i class="fa-solid fa-play"></i> Deploy Compose Stack';
        
        // Success pulse flash on button
        btnDeploySim.style.backgroundColor = '#059669';
        setTimeout(() => {
          btnDeploySim.style.backgroundColor = '';
        }, 1000);
      });
    });
  }

  // -- Crash Simulation Handler --
  if (btnCrashSim) {
    btnCrashSim.addEventListener('click', () => {
      if (!isCrashed) {
        isCrashed = true;
        
        // Trigger visual failures
        if (activeTabKey === 'nginx') {
          nginxContainerBox.style.borderColor = '#EA580C';
          nginxContainerBadge.className = 'badge-status offline uppercase font-mono';
          nginxContainerBadge.textContent = 'CRASHED';
          nginxLed.className = 'led-indicator error';
          nginxFan.classList.remove('active');
        } else {
          postgresContainerBox.style.borderColor = '#EA580C';
          postgresContainerBadge.className = 'badge-status offline uppercase font-mono';
          postgresContainerBadge.textContent = 'CRASHED';
          postgresLed.className = 'led-indicator error';
          postgresFan.classList.remove('active');
        }

        // Print failure logs
        const errorLogs = [
          `[DockOps] Warning: Container status changed inside daemon`,
          `[DockOps] Error: service "${activeTabKey === 'nginx' ? 'web' : 'db'}" exited unexpectedly with status code 137`,
          `[DockOps] Rules engine evaluation: Alert rule "High Resource Kill" matched`,
          `[DockOps] Dispatched Discord webhook payload to alerting endpoint...`
        ];
        
        runLogSimulation(errorLogs, () => {
          workbenchStatusText.textContent = 'Status Warning';
          workbenchStatusDot.className = 'status-dot warning animate-pulse';
        });

        // Show webhook alert toast
        webhookToastMessage.textContent = `Alert: Container "${activeTabKey === 'nginx' ? 'nginx-web' : 'postgres-db'}" exited unexpectedly!`;
        webhookToast.style.display = 'block';
        setTimeout(() => {
          webhookToast.style.opacity = '1';
          webhookToast.style.transform = 'scale(1)';
        }, 50);

        // Change button to recovery mode
        btnCrashSim.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Restart & Recover Container';
        btnCrashSim.className = 'control-btn';
        btnCrashSim.style.backgroundColor = '#059669';
        btnCrashSim.style.color = '#fff';
      } else {
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
          workbenchStatusDot.className = 'status-dot healthy';
        });

        // Reset crash button
        btnCrashSim.innerHTML = '<i class="fa-solid fa-burst"></i> Inject Container Crash';
        btnCrashSim.className = 'control-btn btn-orange';
        btnCrashSim.style.backgroundColor = '';
        btnCrashSim.style.color = '';
      }
    });
  }

  // -- Helper functions --
  function resetContainerStates() {
    nginxContainerBox.style.borderColor = '';
    nginxContainerBadge.className = 'badge-status online uppercase font-mono';
    nginxContainerBadge.textContent = 'Active';
    nginxLed.className = 'led-indicator active';
    nginxFan.classList.add('active');

    postgresContainerBox.style.borderColor = '';
    postgresContainerBadge.className = 'badge-status online uppercase font-mono';
    postgresContainerBadge.textContent = 'Active';
    postgresLed.className = 'led-indicator active';
    postgresFan.classList.add('active');
  }

  function dismissToast() {
    webhookToast.style.opacity = '0';
    webhookToast.style.transform = 'scale(0.95)';
    setTimeout(() => {
      webhookToast.style.display = 'none';
    }, 200);
  }

  if (webhookToastClose) {
    webhookToastClose.addEventListener('click', dismissToast);
  }

  // Copy code handler
  if (copyBtn && codeSnippet) {
    copyBtn.addEventListener('click', () => {
      const text = codeSnippet.textContent.trim();
      navigator.clipboard.writeText(text)
        .then(() => {
          const icon = copyBtn.querySelector('i');
          if (icon) {
            icon.className = 'fa-solid fa-check text-[#059669]';
            setTimeout(() => {
              icon.className = 'fa-solid fa-copy';
            }, 2000);
          }
        })
        .catch(err => console.error('Failed to copy: ', err));
    });
  }

  // Initialize nginx tab
  selectTab('nginx');
});
