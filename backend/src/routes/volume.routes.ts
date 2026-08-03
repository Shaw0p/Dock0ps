import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.middleware';
import docker from '../config/docker';

const router = Router();

// GET /api/volumes - List all volumes and attach container names mounting them
router.get('/', authenticateJWT, async (req, res) => {
  try {
    const [volumesData, containers] = await Promise.all([
      docker.listVolumes(),
      docker.listContainers({ all: true }),
    ]);

    const volumesList = volumesData.Volumes || [];
    
    // Map volume names to containers utilizing them
    const volumeContainersMap: Record<string, { id: string; name: string }[]> = {};
    for (const container of containers) {
      if (container.Mounts) {
        for (const mount of container.Mounts) {
          if (mount.Type === 'volume' && mount.Name) {
            if (!volumeContainersMap[mount.Name]) {
              volumeContainersMap[mount.Name] = [];
            }
            volumeContainersMap[mount.Name].push({
              id: container.Id,
              name: container.Names[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
            });
          }
        }
      }
    }

    const mappedVolumes = volumesList.map((vol: any) => ({
      name: vol.Name,
      driver: vol.Driver,
      mountpoint: vol.Mountpoint,
      createdAt: vol.CreatedAt,
      status: vol.Status,
      containers: volumeContainersMap[vol.Name] || [],
    }));

    res.json(mappedVolumes);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list volumes' });
  }
});

// GET /api/volumes/:name - Inspect a volume
router.get('/:name', authenticateJWT, async (req, res) => {
  try {
    const { name } = req.params;
    const volume = docker.getVolume(name);
    const details = await volume.inspect();
    res.json(details);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to inspect volume' });
  }
});

// POST /api/volumes - Create a volume
router.post('/', authenticateJWT, async (req, res) => {
  try {
    const { name, driver = 'local', driverOpts = {} } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Volume name is required' });
    }
    const result = await docker.createVolume({
      Name: name,
      Driver: driver,
      DriverOpts: driverOpts,
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create volume' });
  }
});

// DELETE /api/volumes/:name - Delete a volume
router.delete('/:name', authenticateJWT, async (req, res) => {
  try {
    const { name } = req.params;
    const force = req.query.force === 'true';
    const volume = docker.getVolume(name);
    await volume.remove({ force });
    res.json({ message: 'Volume deleted successfully', name });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete volume' });
  }
});

// POST /api/volumes/prune - Prune unused volumes
router.post('/prune', authenticateJWT, async (req, res) => {
  try {
    const result = await docker.pruneVolumes();
    res.json({
      message: 'Volumes pruned successfully',
      volumesDeleted: result.VolumesDeleted || [],
      spaceReclaimed: result.SpaceReclaimed || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to prune volumes' });
  }
});

export default router;
