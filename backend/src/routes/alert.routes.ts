import { Router } from 'express';
import { AlertController } from '../controllers/alert.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();
const alertController = new AlertController();

// Rules Configuration
router.get('/rules', authenticateJWT, alertController.listRules);
router.post('/rules', authenticateJWT, alertController.saveRule);
router.delete('/rules/:id', authenticateJWT, alertController.deleteRule);

// Active alerts and history logs
router.get('/history', authenticateJWT, alertController.listHistory);

export default router;
