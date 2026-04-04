import app from './app.js';
import config from './config.js';
import { initDatabase } from './database.js';

const startServer = async () => {
    try {
        // Initialize database first
        await initDatabase();

        // Start server
        app.listen(config.port, () => {
            console.log(`CRM Mahalaxmi API running on port ${config.port}`);
            console.log(`Environment: ${config.nodeEnv}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
