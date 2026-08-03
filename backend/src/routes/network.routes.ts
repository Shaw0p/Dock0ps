import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.middleware';
import docker from '../config/docker';

const router = Router();

// GET /api/networks - List all networks
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const data = await docker.listNetworks();
    res.json(data || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list networks' });
  }
});

// GET /api/networks/:id - Inspect a network
router.get('/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const network = docker.getNetwork(id);
    const details = await network.inspect();
    res.json(details);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to inspect network' });
  }
});

// POST /api/networks - Create a network
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const { name, driver = 'bridge', subnet, gateway } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Network name is required' });
    }

    let ipam: any = undefined;
    if (subnet) {
      ipam = {
        Driver: 'default',
        Config: [{
          Subnet: subnet,
          Gateway: gateway || undefined,
        }]
      };
    }

    const result = await docker.createNetwork({
      Name: name,
      Driver: driver,
      IPAM: ipam,
    });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create network' });
  }
});

// DELETE /api/networks/:id - Delete a network
router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const network = docker.getNetwork(id);
    await network.remove();
    res.json({ message: 'Network deleted successfully', id });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete network' });
  }
});

// POST /api/networks/:id/connect - Connect container to network
router.post('/:id/connect', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { containerId } = req.body;
    if (!containerId) {
      return res.status(400).json({ error: 'containerId is required' });
    }
    const network = docker.getNetwork(id);
    await network.connect({ Container: containerId });
    res.json({ message: 'Container connected to network successfully', id, containerId });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to connect container to network' });
  }
});

// POST /api/networks/:id/disconnect - Disconnect container from network
router.post('/:id/disconnect', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { containerId, force = true } = req.body;
    if (!containerId) {
      return res.status(400).json({ error: 'containerId is required' });
    }
    const network = docker.getNetwork(id);
    await network.disconnect({ Container: containerId, Force: force });
    res.json({ message: 'Container disconnected from network successfully', id, containerId });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to disconnect container from network' });
  }
});

export default router;
