/**
 * <report-generator> — Light DOM web component.
 *
 * Renders a form to generate a report for a given date. On submit it calls
 * POST /api/reports/generate and redirects to the new report page on success.
 */
class ReportGenerator extends HTMLElement {
  connectedCallback() {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    this.innerHTML = `
      <form id="generate-form">
        <label>
          Date
          <input type="date" name="date" value="${yesterday}" required />
        </label>
        <label style="flex-direction: row; align-items: center; gap: 0.4rem;">
          <input type="checkbox" name="force" />
          Force regenerate
        </label>
        <button type="submit">Generate Report</button>
      </form>
      <p class="status-message" aria-live="polite"></p>
    `;

    this.querySelector('form').addEventListener('submit', (e) => this._onSubmit(e));
  }

  /**
   * Handles form submission, calling the API and navigating on success.
   *
   * @param {SubmitEvent} e
   */
  async _onSubmit(e) {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const status = this.querySelector('.status-message');
    const button = form.querySelector('button');

    const date = form.querySelector('input[name="date"]').value;
    const force = form.querySelector('input[name="force"]').checked;

    button.disabled = true;
    button.textContent = 'Generating…';
    status.textContent = '';
    status.className = 'status-message';

    try {
      const res = await fetch('/api/reports/generate', {
        body: JSON.stringify({ date, force }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      status.textContent = 'Report generated! Redirecting…';
      status.className = 'status-message success';
      window.location.href = `/reports/${data.date}`;
    } catch (err) {
      status.textContent = err.message;
      status.className = 'status-message error';
      button.disabled = false;
      button.textContent = 'Generate Report';
    }
  }
}

customElements.define('report-generator', ReportGenerator);
