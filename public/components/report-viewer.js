/**
 * <report-viewer> — Light DOM web component.
 *
 * Reads the raw Markdown from the hidden <pre slot="raw"> element and renders
 * it as formatted text. Falls back gracefully to the raw pre if JS is disabled.
 */
class ReportViewer extends HTMLElement {
  connectedCallback() {
    const raw = this.querySelector('pre[slot="raw"]');
    if (!raw) return;

    const content = raw.textContent || '';

    const div = document.createElement('div');
    div.className = 'report-content';
    div.textContent = content;

    this.appendChild(div);
  }
}

customElements.define('report-viewer', ReportViewer);
