import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import calendarRouter from './routes/calendar.js';
import githubRouter from './routes/github.js';
import jiraRouter from './routes/jira.js';
import confluenceRouter from './routes/confluence.js';
import notesRouter from './routes/notes.js';
import reportsRouter from './routes/reports.js';
import { startScheduler } from './cron/scheduler.js';
import { getReport, listReports } from './db/cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 1337;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// API routes
app.use('/api/calendar', calendarRouter);
app.use('/api/github', githubRouter);
app.use('/api/jira', jiraRouter);
app.use('/api/confluence', confluenceRouter);
app.use('/api/notes', notesRouter);
app.use('/api/reports', reportsRouter);

// UI routes
app.get('/', (_req, res) => {
  const reports = listReports();
  res.render('index', { reports });
});

app.get('/notes', (_req, res) => {
  res.render('notes');
});

app.get('/reports/:date', (req, res) => {
  const { date } = req.params;
  const report = getReport(date);
  if (!report) {
    return res.status(404).render('404', { date });
  }
  return res.render('report', { content: report.content, date: report.date });
});

startScheduler();

// Only bind the port when running as the main entry point, not during tests.
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`dev-log-service running at http://localhost:${PORT}`);
  });
}

export default app;
