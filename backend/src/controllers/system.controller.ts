import { Response } from 'express';
import { DockerService } from '../services/docker.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';

export class SystemController {
  private dockerService = new DockerService();

  getSummary = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const summary = await this.dockerService.getSystemSummary();
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to retrieve system summary' });
    }
  };

  getActivities = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const list = await prisma.activity.findMany({
        take: 15,
        orderBy: { createdAt: 'desc' }
      });
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to retrieve activity history' });
    }
  };
}

