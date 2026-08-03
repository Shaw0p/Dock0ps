document.addEventListener('DOMContentLoaded', () => {
  
  // -- Configurations --
  const templates = {
    nginx: {
      yaml: `# docker-compose.yaml - web edge
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    restart: unless-stopped
    labels:
      - "dockops.stack-edge"`,
      port: ':8080',
      stackName: 'nginx-web'
    },
    postgres: {
      yaml: `# docker-compose.yaml - db storage
services:
  db:
    image: postgres:16
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  pgdata:`,
      port: ':5432',
      stackName: 'postgres-db'
    }
  };

  // -- DOM Elements --
  const tabNginx = document.getElementById('tab-nginx');
  const tabPostgres = document.getElementById('tab-postgres');
  const yamlCodeView = document.getElementById('yaml-code-view');
  
  const btnDeploy = document.getElementById('btn-deploy');
  const btnCrash = document.getElementById('btn-crash');
  
  const topologyStatus = document.getElementById('topology-status');
  const workbenchStackName = document.getElementById('workbench-stack-name');
  
  const ingressPortNode = document.getElementById('ingress-port-node');
  const hostLed = document.querySelector('.host-led');
  
  const containerNodeNginx = document.getElementById('container-node-nginx');
  const containerNodePostgres = document.getElementById('container-node-postgres');
  const volumeWire = document.getElementById('volume-wire');
  const volumeNodeBox = document.getElementById('volume-node-box');
  
  const webhookToast = document.getElementById('webhook-toast');
  const webhookToastMessage = document.getElementById('webhook-toast-message');
  const webhookToastClose = document.getElementById('webhook-toast-close');
  
  const copyBtn = document.getElementById('copy-btn');
  const codeSnippet = document.getElementById('code-snippet');

  let activeTab = 'nginx';
  let isFailed = false;

  // -- Render Tab Function --
  function renderTab(tabKey) {
    activeTab = tabKey;
    isFailed = false;
    dismissToast();

    // Reset Crash button state
    btnCrash.innerHTML = '<i class="fa-solid fa-burst"></i> Inject Fail';
    btnCrash.className = 'workbench-btn btn-orange-small';

    const config = templates[tabKey];
    yamlCodeView.textContent = config.yaml;
    workbenchStackName.textContent = config.stackName;
    
    // Set Ingress text
    ingressPortNode.querySelector('.val').textContent = config.port;

    // Reset system status tag
    topologyStatus.className = 'status-tag live';
    topologyStatus.innerHTML = '<span class="dot"></span> LIVE';
    hostLed.style.backgroundColor = '#059669';
    hostLed.style.boxShadow = '0 0 6px #059669';

    // Show/hide nodes in topology graph
    if (tabKey === 'nginx') {
      tabNginx.className = 'tab-btn active';
      tabPostgres.className = 'tab-btn';
      
      containerNodeNginx.classList.remove('hidden');
      containerNodePostgres.classList.add('hidden');
      
      volumeWire.classList.add('hidden');
      volumeNodeBox.classList.add('hidden');
      
      // Reset container node styling
      containerNodeNginx.style.borderColor = '#0284C7';
      const badge = containerNodeNginx.querySelector('.badge');
      badge.textContent = 'RUNNING 4d';
      badge.className = 'badge online';
    } else {
      tabPostgres.className = 'tab-btn active';
      tabNginx.className = 'tab-btn';
      
      containerNodePostgres.classList.remove('hidden');
      containerNodeNginx.classList.add('hidden');
      
      volumeWire.classList.remove('hidden');
      volumeNodeBox.classList.remove('hidden');
      
      // Reset container node styling
      containerNodePostgres.style.borderColor = '#0284C7';
      const badge = containerNodePostgres.querySelector('.badge');
      badge.textContent = 'RUNNING 4d';
      badge.className = 'badge online';
    }
  }

  // -- Deploy simulation --
  if (btnDeploy) {
    btnDeploy.addEventListener('click', () => {
      btnDeploy.disabled = true;
      btnDeploy.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin"></i> Deploying...';
      
      // Flash LED warning during build
      hostLed.style.backgroundColor = '#EA580C';
      hostLed.style.boxShadow = '0 0 6px #EA580C';
      
      setTimeout(() => {
        btnDeploy.disabled = false;
        btnDeploy.innerHTML = '<i class="fa-solid fa-play"></i> Deploy Stack';
        
        // Restore healthy LEDs
        hostLed.style.backgroundColor = '#059669';
        hostLed.style.boxShadow = '0 0 6px #059669';

        // Brief success flash on button
        const originalBg = btnDeploy.style.backgroundColor;
        btnDeploy.style.backgroundColor = '#059669';
        setTimeout(() => {
          btnDeploy.style.backgroundColor = originalBg;
        }, 1000);
      }, 1200);
    });
  }

  // -- Fail/Crash injection simulation --
  if (btnCrash) {
    btnCrash.addEventListener('click', () => {
      if (!isFailed) {
        // Trigger Crash State
        isFailed = true;

        // Change visual container node border and badge to error
        if (activeTab === 'nginx') {
          containerNodeNginx.style.borderColor = '#EA580C';
          const badge = containerNodeNginx.querySelector('.badge');
          badge.textContent = 'EXITED (137)';
          badge.className = 'badge offline';
        } else {
          containerNodePostgres.style.borderColor = '#EA580C';
          const badge = containerNodePostgres.querySelector('.badge');
          badge.textContent = 'EXITED (137)';
          badge.className = 'badge offline';
        }

        // Set status LED to warning orange
        hostLed.style.backgroundColor = '#EA580C';
        hostLed.style.boxShadow = '0 0 6px #EA580C';
        topologyStatus.className = 'status-tag warning';
        topologyStatus.innerHTML = '<span class="dot" style="background-color: #EA580C;"></span> WARNING';

        // Trigger Webhook Toast popup
        webhookToastMessage.textContent = `Container "${activeTab === 'nginx' ? 'nginx:alpine' : 'postgres:16'}" exited unexpectedly!`;
        webhookToast.style.display = 'block';
        setTimeout(() => {
          webhookToast.style.opacity = '1';
          webhookToast.style.transform = 'scale(1)';
        }, 50);

        // Change button to Recover
        btnCrash.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Recover Node';
        btnCrash.className = 'workbench-btn';
        btnCrash.style.backgroundColor = '#059669';
        btnCrash.style.color = '#fff';
        btnCrash.style.border = 'none';
      } else {
        // Recover State
        isFailed = false;
        renderTab(activeTab);
        
        // Restore button styling
        btnCrash.style.backgroundColor = '';
        btnCrash.style.color = '';
        btnCrash.style.border = '';
      }
    });
  }

  // -- Toast dismiss --
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

  // -- Tab switching --
  if (tabNginx) tabNginx.addEventListener('click', () => renderTab('nginx'));
  if (tabPostgres) tabPostgres.addEventListener('click', () => renderTab('postgres'));

  // Copy code command handler
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const commandText = "curl -fsSL https://get.dockops.dev | sh\ndockops up -d";
      navigator.clipboard.writeText(commandText)
        .then(() => {
          // Success feedback
          copyBtn.innerHTML = '<i class="fa-solid fa-check text-[#059669]"></i> COPIED';
          setTimeout(() => {
            copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> COPY';
          }, 2000);
        })
        .catch(err => console.error('Failed to copy: ', err));
    });
  }

  // Initialize Nginx tab on start
  renderTab('nginx');
});
