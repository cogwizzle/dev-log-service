/**
 * Progressively enhances the regenerate form on the report page.
 *
 * Intercepts the submit event, calls the API, and reloads the page on success
 * rather than doing a full form POST navigation.
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('regenerate-form');
  if (!form) return;

  const date = form.dataset.date;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    button.textContent = 'Regenerating…';

    try {
      const res = await fetch('/api/reports/generate', {
        body: JSON.stringify({ date, force: true }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Regeneration failed');
      }

      window.location.reload();
    } catch (err) {
      button.disabled = false;
      button.textContent = 'Regenerate Report';
      const msg = document.createElement('p');
      msg.className = 'status-message error';
      msg.textContent = err.message;
      form.after(msg);
    }
  });
});
