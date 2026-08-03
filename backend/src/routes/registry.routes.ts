import { Router } from 'express';
import { RegistryController } from '../controllers/registry.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();
const registryController = new RegistryController();

router.get('/', authenticateJWT, registryController.list);
router.post('/', authenticateJWT, registryController.save);
router.delete('/:id', authenticateJWT, registryController.delete);

export default router;
