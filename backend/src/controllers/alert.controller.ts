import { Response } from 'express';
import prisma from '../config/database';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class AlertController {
  
  // -- Rule Endpoints --
  
  listRules = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rules = await prisma.alertRule.findMany({
        orderBy: { createdAt: 'desc' }
      });
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list alert rules' });
    }
  };

  saveRule = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, name, metric, condition, value, enabled, channel, webhookUrl } = req.body;
      
      if (!name || !metric || !condition || value === undefined) {
        return res.status(400).json({ error: 'name, metric, condition, and value are required' });
      }

      if (id) {
        // Update existing rule
        const rule = await prisma.alertRule.update({
          where: { id },
          data: {
            name,
            metric,
            condition,
            value: Number(value),
            enabled: enabled !== false,
            channel: channel || 'SLACK',
            webhookUrl: webhookUrl || null,
          }
        });
        return res.json(rule);
      } else {
        // Create new rule
        const rule = await prisma.alertRule.create({
          data: {
            name,
            metric,
            condition,
            value: Number(value),
            enabled: enabled !== false,
            channel: channel || 'SLACK',
            webhookUrl: webhookUrl || null,
          }
        });
        return res.status(201).json(rule);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to save alert rule' });
    }
  };

  deleteRule = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await prisma.alertRule.delete({
        where: { id }
      });
      res.json({ message: 'Alert rule deleted successfully', id });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete alert rule' });
    }
  };

  // -- History Endpoints --

  listHistory = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const history = await prisma.alertHistory.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' }
      });
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list alert history' });
    }
  };
}
export default AlertController;
