import { Response } from 'express';
import { ImageService } from '../services/image.service';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class ImageController {
  private imageService = new ImageService();

  list = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const list = await this.imageService.listImages();
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to list images' });
    }
  };

  inspect = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const data = await this.imageService.inspectImage(id);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to inspect image' });
    }
  };

  delete = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const force = req.query.force === 'true';
      const result = await this.imageService.deleteImage(id, force);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete image' });
    }
  };

  tag = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id, repo, tag } = req.body;
      if (!id || !repo || !tag) {
        return res.status(400).json({ error: 'id, repo, and tag are required' });
      }
      const result = await this.imageService.tagImage(id, repo, tag);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to tag image' });
    }
  };

  search = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const term = (req.query.term || req.query.query) as string;
      if (!term) {
        return res.status(400).json({ error: 'Search term is required' });
      }
      const results = await this.imageService.searchDockerHub(term);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to search Docker Hub' });
    }
  };

  pull = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { imageName, socketId } = req.body;
      if (!imageName) {
        return res.status(400).json({ error: 'imageName is required' });
      }

      // Non-blocking pull. We run it in the background and let Socket.IO handle progress reporting
      this.imageService.pullImage(imageName, socketId)
        .then(() => console.log(`[Image Service] Pulled image ${imageName} successfully`))
        .catch(err => console.error(`[Image Service] Failed to pull image ${imageName}:`, err.message));

      res.status(202).json({
        message: 'Pulling process initiated in the background.',
        imageName,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to initiate pull' });
    }
  };
}
export default ImageController;
