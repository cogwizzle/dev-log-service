/**
 * <backfill-form> — Progressive enhancement web component.
 *
 * The form HTML is rendered server-side. This component only attaches a submit
 * handler that intercepts the POST and streams NDJSON progress to the log panel.
 * Without JavaScript the form submits normally via HTTP POST.
 */
class BackfillForm extends HTMLElement {
  connectedCallback() {
    this.querySelector('form').addEventListener('submit', (e) => this._onSubmit(e));
  }

  /**
   * Handles form submission, streaming NDJSON progress from the API.
   *
   * @param {SubmitEvent} e
   */
  async _onSubmit(e) {
    e.preventDefault();
    const form = /** @type {HTMLFormElement} */ (e.target);
    const status = this.querySelector('.status-message');
    const log = /** @type {HTMLPreElement} */ (this.querySelector('.backfill-log'));
    const button = form.querySelector('button');

    const from = form.querySelector('input[name="from"]').value;
    const to = form.querySelector('input[name="to"]').value;
    const force = form.querySelector('input[name="force"]').checked;

    button.disabled = true;
    button.textContent = 'Running…';
    status.textContent = '';
    status.className = 'status-message';
    log.textContent = '';
    log.hidden = false;

    try {
      const res = await fetch('/api/reports/backfill', {
        body: JSON.stringify({ force, from, to }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Backfill failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            this._appendLog(log, event);
            if (event.done) {
              this._onDone(status, button, event);
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (err) {
      status.textContent = err.message;
      status.className = 'status-message error';
      button.disabled = false;
      button.textContent = 'Run Backfill';
    }
  }

  /**
   * Appends a progress event line to the log pre element.
   *
   * @param {HTMLPreElement} log
   * @param {object} event
   */
  _appendLog(log, event) {
    if (event.done) return;
    const icon = event.status === 'generated' ? '✓' : event.status === 'error' ? '✗' : '–';
    const detail = event.reason ? ` (${event.reason})` : '';
    log.textContent += `${icon} ${event.date}  ${event.status}${detail}\n`;
    log.scrollTop = log.scrollHeight;
  }

  /**
   * Updates UI state after the stream completes.
   *
   * @param {HTMLElement} status
   * @param {HTMLButtonElement} button
   * @param {{ done: true, generated?: number, skipped?: number, errors?: number, error?: string }} event
   */
  _onDone(status, button, event) {
    button.disabled = false;
    button.textContent = 'Run Backfill';
    if (event.error) {
      status.textContent = `Backfill failed: ${event.error}`;
      status.className = 'status-message error';
    } else {
      status.textContent = `Done — generated: ${event.generated}, skipped: ${event.skipped}, errors: ${event.errors}`;
      status.className = event.errors > 0 ? 'status-message error' : 'status-message success';
    }
  }
}

customElements.define('backfill-form', BackfillForm);
