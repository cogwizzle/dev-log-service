import cron from 'node-cron';
import { generateReport, previousBusinessDay } from '../services/report.js';

/**
 * Starts the daily report generation cron job.
 *
 * Fires at 10:00 AM Monday through Friday. Generates a report for the previous
 * business day (Friday's report is generated Monday morning).
 */
export function startScheduler() {
  // Runs at 10:00 AM, Monday–Friday
  cron.schedule('0 10 * * 1-5', async () => {
    const date = previousBusinessDay();
    // eslint-disable-next-line no-console
    console.log(`[cron] Generating report for ${date}`);
    try {
      const { filePath } = await generateReport(date);
      // eslint-disable-next-line no-console
      console.log(`[cron] Report saved to ${filePath}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[cron] Failed to generate report for ${date}:`, err);
    }
  });

  // eslint-disable-next-line no-console
  console.log('[cron] Daily report scheduler started (10:00 AM Mon–Fri)');
}
