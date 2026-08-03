import { Router } from 'express';
import { ContainerController } from '../controllers/container.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();
const containerController = new ContainerController();

router.get('/', authenticateJWT, containerController.list);
router.post('/', authenticateJWT, containerController.create);
router.get('/:id', authenticateJWT, containerController.inspect);
router.get('/:id/processes', authenticateJWT, containerController.processes);
router.get('/:id/health', authenticateJWT, containerController.health);
router.get('/:id/metrics/history', authenticateJWT, containerController.metricsHistory);
router.patch('/start/:id', authenticateJWT, containerController.start);
router.patch('/stop/:id', authenticateJWT, containerController.stop);
router.patch('/restart/:id', authenticateJWT, containerController.restart);
router.delete('/:id', authenticateJWT, containerController.delete);
router.patch('/rename/:id', authenticateJWT, containerController.rename);
router.post('/duplicate/:id', authenticateJWT, containerController.duplicate);

export default router;
