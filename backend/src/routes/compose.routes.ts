import { Router } from 'express';
import { ComposeController } from '../controllers/compose.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();
const composeController = new ComposeController();

router.get('/', authenticateJWT, composeController.list);
router.post('/', authenticateJWT, composeController.save);
router.get('/:name', authenticateJWT, composeController.details);
router.post('/:name/deploy', authenticateJWT, composeController.deploy);
router.post('/:name/stop', authenticateJWT, composeController.stop);
router.post('/:name/restart', authenticateJWT, composeController.restart);
router.post('/:name/rebuild', authenticateJWT, composeController.rebuild);
router.post('/:name/pull', authenticateJWT, composeController.pull);
router.delete('/:name', authenticateJWT, composeController.delete);

export default router;
