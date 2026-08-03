import { Response } from 'express';
import { ComposeService } from '../services/compose.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { getIO } from '../config/socket';
import { logActivity } from '../utils/activity';

export class ComposeController {
  private composeService = new ComposeService();

  private emitStackLog(name: string, message: string) {
    try {
      const io = getIO();
      io.to(`stack-logs:${name}`).emit(`stack-log-output:${name}`, message);
    } catch (e) {
      // socket.io not initialized or offline
    }
  }

  save = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, yamlContent } = req.body;
      if (!name || !yamlContent) {
        return res.status(400).json({ error: 'Stack name and yamlContent are required' });
      }
      const stack = await this.composeService.saveStack(name, yamlContent);
      logActivity(req.user?.id || null, 'STACK_SAVED', `Saved Compose config for stack: ${name}`, req.user?.email || null);
      res.status(201).json(stack);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to save stack' });
    }
  };

  list = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const list = await this.composeService.listStacks();
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list stacks' });
    }
  };

  details = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name } = req.params;
      const data = await this.composeService.getStackDetails(name);
      res.json(data);
    } catch (error: any) {
      res.status(404).json({ error: error.message || 'Stack not found' });
    }
  };

  deploy = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name } = req.params;
      
      // Trigger background deploy and stream logs via socket.io
      this.composeService.deploy(name, (msg) => this.emitStackLog(name, msg))
        .then(() => {
          logActivity(req.user?.id || null, 'STACK_DEPLOY_SUCCESS', `Stack "${name}" deployed successfully`, req.user?.email || null);
        })
        .catch(err => {
          logActivity(req.user?.id || null, 'STACK_DEPLOY_FAILED', `Stack "${name}" deployment failed: ${err.message}`, req.user?.email || null);
          console.error(`[Compose Controller] Background deploy error for ${name}:`, err);
        });

      logActivity(req.user?.id || null, 'STACK_DEPLOY_INITIATED', `Initiated deployment of stack: ${name}`, req.user?.email || null);
      res.status(202).json({ message: 'Deployment initiated in background', status: 'DEPLOYING' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to trigger deploy' });
    }
  };

  stop = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name } = req.params;

      this.composeService.stop(name, (msg) => this.emitStackLog(name, msg))
        .then(() => {
          logActivity(req.user?.id || null, 'STACK_STOP_SUCCESS', `Stack "${name}" stopped successfully`, req.user?.email || null);
        })
        .catch(err => console.error(`[Compose Controller] Background stop error for ${name}:`, err));

      logActivity(req.user?.id || null, 'STACK_STOP_INITIATED', `Initiated stop for stack: ${name}`, req.user?.email || null);
      res.status(202).json({ message: 'Stop initiated in background', status: 'STOPPING' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to stop stack' });
    }
  };

  restart = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name } = req.params;

      this.composeService.restart(name, (msg) => this.emitStackLog(name, msg))
        .then(() => {
          logActivity(req.user?.id || null, 'STACK_RESTART_SUCCESS', `Stack "${name}" restarted successfully`, req.user?.email || null);
        })
        .catch(err => console.error(`[Compose Controller] Background restart error for ${name}:`, err));

      logActivity(req.user?.id || null, 'STACK_RESTART_INITIATED', `Initiated restart for stack: ${name}`, req.user?.email || null);
      res.status(202).json({ message: 'Restart initiated in background', status: 'RESTARTING' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to restart stack' });
    }
  };

  rebuild = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name } = req.params;

      this.composeService.rebuild(name, (msg) => this.emitStackLog(name, msg))
        .then(() => {
          logActivity(req.user?.id || null, 'STACK_REBUILD_SUCCESS', `Stack "${name}" rebuilt successfully`, req.user?.email || null);
        })
        .catch(err => console.error(`[Compose Controller] Background rebuild error for ${name}:`, err));

      logActivity(req.user?.id || null, 'STACK_REBUILD_INITIATED', `Initiated rebuild for stack: ${name}`, req.user?.email || null);
      res.status(202).json({ message: 'Rebuild initiated in background', status: 'REBUILDING' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to rebuild stack' });
    }
  };

  pull = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name } = req.params;

      this.composeService.pull(name, (msg) => this.emitStackLog(name, msg))
        .then(() => {
          logActivity(req.user?.id || null, 'STACK_PULL_SUCCESS', `Stack "${name}" images pulled successfully`, req.user?.email || null);
        })
        .catch(err => console.error(`[Compose Controller] Background pull error for ${name}:`, err));

      logActivity(req.user?.id || null, 'STACK_PULL_INITIATED', `Initiated image pulling for stack: ${name}`, req.user?.email || null);
      res.status(202).json({ message: 'Pull initiated in background', status: 'PULLING' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to pull stack images' });
    }
  };

  delete = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name } = req.params;
      const removeVolumes = req.query.removeVolumes === 'true';
      await this.composeService.deleteStack(name, removeVolumes);
      logActivity(req.user?.id || null, 'STACK_DELETED', `Deleted stack config and services: ${name}`, req.user?.email || null);
      res.json({ message: 'Stack deleted successfully', name });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete stack' });
    }
  };
}
export default ComposeController;
