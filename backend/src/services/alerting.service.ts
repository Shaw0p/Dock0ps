import https from 'https';
import { URL } from 'url';
import prisma from '../config/database';
import docker from '../config/docker';

export class AlertingService {
  /**
   * Helper to dispatch JSON payload to slack or discord webhooks
   */
  private async postWebhook(webhookUrl: string, channel: string, message: string) {
    if (!webhookUrl) return;

    try {
      const urlObj = new URL(webhookUrl);
      const payload: any = {};
      
      if (channel === 'SLACK') {
        payload.text = `🚨 *DockOps Alert* 🚨\n${message}`;
      } else if (channel === 'DISCORD') {
        payload.content = `🚨 **DockOps Alert** 🚨\n${message}`;
      } else {
        payload.text = message;
        payload.content = message;
      }

      const postData = JSON.stringify(payload);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      return new Promise<void>((resolve, reject) => {
        const req = https.request(options, (res) => {
          res.resume(); // consume output stream
          res.on('end', () => resolve());
        });
        
        req.on('error', (err) => reject(err));
        req.write(postData);
        req.end();
      });
    } catch (e: any) {
      console.error(`[Alerting Webhook] Failed to post webhook trigger to ${channel}:`, e.message);
    }
  }

  /**
   * Evaluation engine checks CPU/RAM values and stopped container alerts
   */
  async checkAlerts() {
    try {
      const rules = await prisma.alertRule.findMany({ where: { enabled: true } });
      if (rules.length === 0) return;

      const containers = await docker.listContainers({ all: true });

      for (const containerInfo of containers) {
        const containerId = containerInfo.Id;
        const containerName = (containerInfo.Names || [])[0]?.replace(/^\//, '') || containerId.slice(0, 12);
        const isRunning = containerInfo.State === 'running';

        // Retrieve latest metric for this container
        const latestMetric = await prisma.containerMetric.findFirst({
          where: { containerId },
          orderBy: { timestamp: 'desc' },
        });

        for (const rule of rules) {
          let triggered = false;
          let msg = '';
          const value = rule.value;

          if (rule.metric === 'STATUS') {
            // Alert if status rule expects running (value == 1) but it is stopped,
            // or if it expects stopped (value == 0) and it is stopped.
            if (rule.condition === '==' && value === 1 && !isRunning) {
              triggered = true;
              msg = `Container "${containerName}" is stopped (expected running state).`;
            } else if (rule.condition === '==' && value === 0 && !isRunning) {
              triggered = true;
              msg = `Container "${containerName}" is in a stopped state.`;
            }
          } else if (latestMetric) {
            if (rule.metric === 'CPU') {
              if (rule.condition === '>' && latestMetric.cpu > value) {
                triggered = true;
                msg = `Container "${containerName}" CPU utilization is ${latestMetric.cpu.toFixed(1)}% (exceeds threshold of ${value}%).`;
              } else if (rule.condition === '<' && latestMetric.cpu < value) {
                triggered = true;
                msg = `Container "${containerName}" CPU utilization is ${latestMetric.cpu.toFixed(1)}% (falls below threshold of ${value}%).`;
              }
            } else if (rule.metric === 'MEMORY') {
              if (rule.condition === '>' && latestMetric.memory > value) {
                triggered = true;
                msg = `Container "${containerName}" RAM utilization is ${latestMetric.memory.toFixed(1)}% (exceeds threshold of ${value}%).`;
              } else if (rule.condition === '<' && latestMetric.memory < value) {
                triggered = true;
                msg = `Container "${containerName}" RAM utilization is ${latestMetric.memory.toFixed(1)}% (falls below threshold of ${value}%).`;
              }
            }
          }

          // Check if this specific alert is already currently active in database
          const activeAlert = await prisma.alertHistory.findFirst({
            where: {
              containerId,
              ruleId: rule.id,
              status: 'TRIGGERED',
            },
          });

          if (triggered) {
            if (!activeAlert) {
              // Create trigger entry
              await prisma.alertHistory.create({
                data: {
                  containerId,
                  containerName,
                  ruleId: rule.id,
                  ruleName: rule.name,
                  message: msg,
                  status: 'TRIGGERED',
                },
              });

              // Dispatch Notification
              if (rule.webhookUrl) {
                await this.postWebhook(rule.webhookUrl, rule.channel, msg);
              }
            }
          } else {
            // Condition is fine. If it was previously triggered, resolve it!
            if (activeAlert) {
              await prisma.alertHistory.update({
                where: { id: activeAlert.id },
                data: { status: 'RESOLVED' },
              });

              // Dispatch recovery notice
              const resolveMsg = `✅ RESOLVED: Container "${containerName}" condition has recovered under threshold rule "${rule.name}".`;
              if (rule.webhookUrl) {
                await this.postWebhook(rule.webhookUrl, rule.channel, resolveMsg);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[Alerting Engine] Evaluation run failed:', err.message);
    }
  }
}
export default AlertingService;
