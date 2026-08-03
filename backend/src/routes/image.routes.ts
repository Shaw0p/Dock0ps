import { Router } from 'express';
import { ImageController } from '../controllers/image.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();
const imageController = new ImageController();

router.get('/', authenticateJWT, imageController.list);
router.get('/search', authenticateJWT, imageController.search);
router.post('/pull', authenticateJWT, imageController.pull);
router.post('/tag', authenticateJWT, imageController.tag);
router.get('/:id', authenticateJWT, imageController.inspect);
router.delete('/:id', authenticateJWT, imageController.delete);

export default router;
