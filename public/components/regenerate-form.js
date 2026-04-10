/**
 * Progressively enhances the Regenerate Report button on the report page.
 *
 * Intercepts the click event, calls POST /api/reports/generate with force=true,
 * and reloads the page on success.
 */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('regenerate-btn');
  if (!btn) return;

  const date = btn.dataset.date;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Regenerating…';

    // Remove any previous error message
    document.getElementById('regenerate-error')?.remove();

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
      btn.disabled = false;
      btn.textContent = 'Regenerate Report';
      const msg = document.createElement('p');
      msg.id = 'regenerate-error';
      msg.className = 'status-message error';
      msg.textContent = err.message;
      btn.insertAdjacentElement('afterend', msg);
    }
  });
});
