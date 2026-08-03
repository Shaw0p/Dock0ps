import { Response } from 'express';
import { ContainerService } from '../services/container.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { logActivity } from '../utils/activity';
import prisma from '../config/database';


export class ContainerController {
  private containerService = new ContainerService();

  list = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const all = req.query.all !== 'false'; // default to true
      const list = await this.containerService.listContainers(all);
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list containers' });
    }
  };

  inspect = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const data = await this.containerService.inspectContainer(id);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to inspect container' });
    }
  };

  start = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await this.containerService.startContainer(id);
      logActivity(req.user?.id || null, 'CONTAINER_STARTED', `Started container: ${id.slice(0, 12)}`, req.user?.email || null);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to start container' });
    }
  };

  stop = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await this.containerService.stopContainer(id);
      logActivity(req.user?.id || null, 'CONTAINER_STOPPED', `Stopped container: ${id.slice(0, 12)}`, req.user?.email || null);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to stop container' });
    }
  };

  restart = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await this.containerService.restartContainer(id);
      logActivity(req.user?.id || null, 'CONTAINER_RESTARTED', `Restarted container: ${id.slice(0, 12)}`, req.user?.email || null);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to restart container' });
    }
  };

  delete = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const force = req.query.force === 'true';
      const result = await this.containerService.deleteContainer(id, force);
      logActivity(req.user?.id || null, 'CONTAINER_DELETED', `Deleted container: ${id.slice(0, 12)}`, req.user?.email || null);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete container' });
    }
  };

  rename = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'New container name is required' });
      }
      const result = await this.containerService.renameContainer(id, name);
      logActivity(req.user?.id || null, 'CONTAINER_RENAMED', `Renamed container ${id.slice(0, 12)} to ${name}`, req.user?.email || null);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to rename container' });
    }
  };

  duplicate = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await this.containerService.duplicateContainer(id);
      logActivity(req.user?.id || null, 'CONTAINER_DUPLICATED', `Duplicated container ${id.slice(0, 12)} as ${result.name}`, req.user?.email || null);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to duplicate container' });
    }
  };

  create = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await this.containerService.createContainer(req.body);
      logActivity(req.user?.id || null, 'CONTAINER_CREATED', `Created container: ${result.name} (${result.id.slice(0, 12)})`, req.user?.email || null);
      res.status(201).json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to create container' });
    }
  };


  processes = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await this.containerService.getProcesses(id);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch running processes' });
    }
  };

  health = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await this.containerService.getHealth(id);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch health check details' });
    }
  };

  metricsHistory = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const history = await prisma.containerMetric.findMany({
        where: { containerId: id },
        orderBy: { timestamp: 'asc' },
        take: 120, // last ~1 hour of ticks
      });
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to retrieve container metrics history' });
    }
  };
}
export default ContainerController;
