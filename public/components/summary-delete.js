/**
 * Progressively enhances delete buttons on the summaries table.
 *
 * Uses the same two-step confirmation pattern as work-notes-editor:
 * first click shows "Confirm? / Cancel", second click deletes, auto-resets after 4s.
 */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.summaries-table .btn-delete').forEach((btn) => {
    btn.addEventListener('click', () => confirmDelete(/** @type {HTMLButtonElement} */ (btn)));
  });
});

/**
 * @param {HTMLButtonElement} btn
 */
function confirmDelete(btn) {
  if (btn.dataset.confirming) return;
  btn.dataset.confirming = '1';

  const original = btn.textContent;
  btn.textContent = 'Confirm?';
  btn.classList.add('btn-delete--confirming');

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-cancel';
  cancelBtn.textContent = 'Cancel';
  btn.insertAdjacentElement('afterend', cancelBtn);

  const reset = () => {
    clearTimeout(timer);
    btn.textContent = original;
    btn.classList.remove('btn-delete--confirming');
    delete btn.dataset.confirming;
    cancelBtn.remove();
  };

  const timer = setTimeout(reset, 4000);
  cancelBtn.addEventListener('click', reset);

  setTimeout(() => {
    btn.addEventListener(
      'click',
      async () => {
        clearTimeout(timer);
        cancelBtn.remove();
        btn.disabled = true;
        btn.textContent = '…';
        try {
          const res = await fetch(`/api/summaries/${btn.dataset.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Delete failed');
          btn.closest('tr').remove();
        } catch (err) {
          reset();
          // eslint-disable-next-line no-console
          console.error(err);
        }
      },
      { once: true }
    );
  }, 0);
}
