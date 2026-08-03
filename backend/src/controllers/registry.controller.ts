import { Response } from 'express';
import { RegistryService } from '../services/registry.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class RegistryController {
  private registryService = new RegistryService();

  save = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, url, username, password } = req.body;
      if (!name || !url || !username || !password) {
        return res.status(400).json({ error: 'name, url, username, and password are required' });
      }
      
      const registry = await this.registryService.saveRegistry(name, url, username, password);
      
      // Exclude password in response
      const { password: _, ...safeRegistry } = registry;
      res.status(201).json(safeRegistry);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to save registry credentials' });
    }
  };

  list = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const list = await this.registryService.listRegistries();
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list registries' });
    }
  };

  delete = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      await this.registryService.deleteRegistry(id);
      res.json({ message: 'Registry credentials deleted successfully', id });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete registry credentials' });
    }
  };
}
export default RegistryController;
