import express from 'express';
import apiRoutes from './routes/api.js';
import { notFound, handleError } from './middleware/errors.js';

const app = express();

app.disable('x-powered-by');
app.use('/api', express.json(), apiRoutes);
app.use(notFound);
app.use(handleError);

export default app;
