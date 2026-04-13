/**
 * <summary-generator> — Light DOM web component.
 *
 * Renders a form with a title input and from/to date pickers. On submit it
 * calls POST /api/summaries/generate and redirects to the new summary page.
 */
class SummaryGenerator extends HTMLElement {
  connectedCallback() {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    this.innerHTML = `
      <form id="summary-form">
        <label>
          Title
          <input type="text" name="title" placeholder="e.g. Week of April 7" required />
        </label>
        <div class="date-range-row">
          <label>
            From
            <input type="date" name="from" value="${weekAgo}" required />
          </label>
          <label>
            To
            <input type="date" name="to" value="${today}" required />
          </label>
        </div>
        <button type="submit">Generate Summary</button>
      </form>
      <p class="status-message" aria-live="polite"></p>
    `;

    this.querySelector('form').addEventListener('submit', (e) => this._onSubmit(e));
  }

  /**
   * @param {SubmitEvent} e
   */
  async _onSubmit(e) {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const status = this.querySelector('.status-message');
    const button = form.querySelector('button');

    const title = form.querySelector('input[name="title"]').value.trim();
    const from = form.querySelector('input[name="from"]').value;
    const to = form.querySelector('input[name="to"]').value;

    button.disabled = true;
    button.textContent = 'Generating…';
    status.textContent = '';
    status.className = 'status-message';

    try {
      const res = await fetch('/api/summaries/generate', {
        body: JSON.stringify({ from, title, to }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      window.location.href = `/summaries/${data.summary.id}`;
    } catch (err) {
      status.textContent = err.message;
      status.className = 'status-message error';
      button.disabled = false;
      button.textContent = 'Generate Summary';
    }
  }
}

customElements.define('summary-generator', SummaryGenerator);
