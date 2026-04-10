/**
 * <work-notes-editor> — Light DOM web component.
 *
 * Renders a date picker and textarea for recording freeform work notes for a
 * specific date. Loads any existing note when the date changes, and saves on
 * button click. The selected date stays in sync with the report generator's
 * date input when both are on the same page.
 */
class WorkNotesEditor extends HTMLElement {
  connectedCallback() {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    this.innerHTML = `
      <form id="notes-form">
        <label>
          Date
          <input type="date" name="date" value="${yesterday}" required />
        </label>
        <label>
          Notes
          <textarea name="content" rows="6" placeholder="e.g. Investigated LAB-1234 root cause, had design sync on X feature, reviewed PRD for Y..."></textarea>
        </label>
        <button type="submit">Save Notes</button>
      </form>
      <p class="status-message" aria-live="polite"></p>
    `;

    const form = this.querySelector('form');
    const dateInput = form.querySelector('input[name="date"]');
    const textarea = form.querySelector('textarea');

    // Load note whenever the date changes
    dateInput.addEventListener('change', () => this._load(dateInput.value, textarea));

    // Keep in sync with the report-generator date input if present
    const reportDateInput = document.querySelector('report-generator input[type="date"]');
    if (reportDateInput) {
      reportDateInput.addEventListener('change', () => {
        dateInput.value = reportDateInput.value;
        this._load(dateInput.value, textarea);
      });
    }

    form.addEventListener('submit', (e) => this._onSubmit(e));

    // Load initial note
    this._load(yesterday, textarea);
  }

  /**
   * Fetches and populates the note for the given date.
   *
   * @param {string} date
   * @param {HTMLTextAreaElement} textarea
   */
  async _load(date, textarea) {
    try {
      const res = await fetch(`/api/notes/${date}`);
      if (!res.ok) return;
      const data = await res.json();
      textarea.value = data.content;
    } catch {
      // Silently ignore load failures
    }
  }

  /**
   * Saves the note via PUT /api/notes/:date.
   *
   * @param {SubmitEvent} e
   */
  async _onSubmit(e) {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const status = this.querySelector('.status-message');
    const button = form.querySelector('button');
    const date = form.querySelector('input[name="date"]').value;
    const content = form.querySelector('textarea[name="content"]').value;

    button.disabled = true;
    button.textContent = 'Saving…';
    status.textContent = '';
    status.className = 'status-message';

    try {
      const res = await fetch(`/api/notes/${date}`, {
        body: JSON.stringify({ content }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Save failed');
      }

      status.textContent = 'Notes saved.';
      status.className = 'status-message success';
      setTimeout(() => { status.textContent = ''; }, 2000);
    } catch (err) {
      status.textContent = err.message;
      status.className = 'status-message error';
    } finally {
      button.disabled = false;
      button.textContent = 'Save Notes';
    }
  }
}

customElements.define('work-notes-editor', WorkNotesEditor);
