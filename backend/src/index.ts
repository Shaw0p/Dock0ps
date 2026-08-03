import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initSocket } from './config/socket';
import authRoutes from './routes/auth.routes';
import systemRoutes from './routes/system.routes';
import containerRoutes from './routes/container.routes';
import imageRoutes from './routes/image.routes';
import volumeRoutes from './routes/volume.routes';
import networkRoutes from './routes/network.routes';
import composeRoutes from './routes/compose.routes';
import registryRoutes from './routes/registry.routes';
import alertRoutes from './routes/alert.routes';



import { errorHandler } from './middleware/error.middleware';
import prisma from './config/database';
import docker from './config/docker';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test routes
app.get('/api/health', async (req, res) => {
  try {
    // Check DB connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check Docker Daemon connection
    const dockerInfo = await docker.info();
    
    res.json({
      status: 'OK',
      database: 'Connected',
      docker: 'Connected',
      dockerOS: dockerInfo.OSType,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'Error',
      message: error.message,
    });
  }
});

// App Routes
app.use('/api/auth', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/containers', containerRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/volumes', volumeRoutes);
app.use('/api/networks', networkRoutes);
app.use('/api/stacks', composeRoutes);
app.use('/api/registries', registryRoutes);
app.use('/api/alerts', alertRoutes);




// Error handling middleware
app.use(errorHandler);

// Create HTTP server and initialize Socket.IO
const httpServer = createServer(app);
const io = initSocket(httpServer);

// Initialize Socket.IO Streaming services (Logs, Stats, Events)
import socketStreamService from './services/socket-stream.service';
socketStreamService.init(io);

// Start periodic metrics broadcasting
import { startMetricsBroadcasting } from './services/metrics.service';
startMetricsBroadcasting();

// Start background metrics collection & alerting
import { MetricsCollectorService } from './services/metrics-collector.service';
const metricsCollector = new MetricsCollectorService();
metricsCollector.start();

// Start server
httpServer.listen(PORT, () => {
  console.log(`[DockOps Server] Running on http://localhost:${PORT}`);
});
