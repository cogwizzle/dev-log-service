/**
 * <report-list> — Light DOM web component.
 *
 * Renders the slotted list of report links. Progressively enhances by adding
 * a client-side filter input when JavaScript is available.
 */
class ReportList extends HTMLElement {
  connectedCallback() {
    const filter = document.createElement('input');
    filter.type = 'search';
    filter.placeholder = 'Filter by date…';
    filter.setAttribute('aria-label', 'Filter reports');
    filter.style.cssText =
      'border:1px solid var(--color-border);border-radius:var(--radius);font-size:0.875rem;margin-bottom:0.75rem;padding:0.4rem 0.75rem;width:100%;max-width:220px;';

    filter.addEventListener('input', () => {
      const query = filter.value.toLowerCase();
      this.querySelectorAll('li').forEach((li) => {
        const text = li.textContent.toLowerCase();
        li.style.display = text.includes(query) ? '' : 'none';
      });
    });

    this.insertBefore(filter, this.firstChild);
  }
}

customElements.define('report-list', ReportList);
