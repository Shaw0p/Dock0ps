import { Router } from 'express';
import { SystemController } from '../controllers/system.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();
const systemController = new SystemController();

router.get('/summary', authenticateJWT, systemController.getSummary);
router.get('/activities', authenticateJWT, systemController.getActivities);

export default router;
