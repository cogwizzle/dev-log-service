/**
 * <work-notes-editor> — Light DOM web component.
 *
 * Renders a date picker, a text input to add bullet-point work notes, and a
 * table listing all notes for the selected date. Each row has a delete button
 * and supports inline editing (click the note text to edit in place).
 */
class WorkNotesEditor extends HTMLElement {
  connectedCallback() {
    const today = new Date().toISOString().split('T')[0];
    this._date = today;

    this.innerHTML = `
      <div class="notes-date-row">
        <label>
          Date
          <input type="date" id="notes-date-input" value="${today}" />
        </label>
      </div>
      <div class="notes-add-row">
        <input type="text" id="notes-text-input" placeholder="Add a work note…" autocomplete="off" />
        <button id="notes-add-btn">Add</button>
      </div>
      <p class="status-message" aria-live="polite"></p>
      <div class="notes-table-wrap">
        <table class="notes-table">
          <thead>
            <tr>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="notes-tbody"></tbody>
        </table>
        <p class="notes-empty" hidden>No notes for this date.</p>
      </div>
    `;

    this._dateInput = this.querySelector('#notes-date-input');
    this._textInput = this.querySelector('#notes-text-input');
    this._addBtn = this.querySelector('#notes-add-btn');
    this._tbody = this.querySelector('#notes-tbody');
    this._empty = this.querySelector('.notes-empty');
    this._status = this.querySelector('.status-message');

    this._dateInput.addEventListener('change', () => {
      this._date = this._dateInput.value;
      this._load();
    });

    this._addBtn.addEventListener('click', () => this._add());
    this._textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._add();
    });

    this._load();
  }

  /**
   * Fetches notes for the current date and re-renders the table.
   */
  async _load() {
    try {
      const res = await fetch(`/api/notes/${this._date}`);
      if (!res.ok) return;
      const { notes } = await res.json();
      this._render(notes);
    } catch {
      // Silently ignore
    }
  }

  /**
   * Renders the notes list into the table body.
   *
   * @param {Array<{ id: number, content: string }>} notes
   */
  _render(notes) {
    this._tbody.innerHTML = '';
    this._empty.hidden = notes.length > 0;
    this.querySelector('.notes-table').hidden = notes.length === 0;

    notes.forEach((note) => {
      const tr = document.createElement('tr');
      tr.dataset.id = String(note.id);

      const tdContent = document.createElement('td');
      tdContent.className = 'note-content';
      tdContent.textContent = note.content;
      tdContent.title = 'Click to edit';

      // Inline edit on click
      tdContent.addEventListener('click', () => this._startEdit(tdContent, note));

      const tdAction = document.createElement('td');
      tdAction.className = 'note-action';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-delete';
      delBtn.textContent = '×';
      delBtn.setAttribute('aria-label', 'Delete note');
      delBtn.addEventListener('click', () => this._confirmDelete(note.id, tr, delBtn));
      tdAction.appendChild(delBtn);

      tr.appendChild(tdContent);
      tr.appendChild(tdAction);
      this._tbody.appendChild(tr);
    });
  }

  /**
   * Adds a new note from the text input.
   */
  async _add() {
    const content = this._textInput.value.trim();
    if (!content) return;

    this._addBtn.disabled = true;
    try {
      const res = await fetch(`/api/notes/${this._date}`, {
        body: JSON.stringify({ content }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to add note');
      this._textInput.value = '';
      await this._load();
    } catch (err) {
      this._showStatus(err.message, 'error');
    } finally {
      this._addBtn.disabled = false;
      this._textInput.focus();
    }
  }

  /**
   * Progressively enhances the delete button with a two-step confirmation.
   *
   * On first click the button is replaced with "Confirm?" and a cancel link.
   * If the user does not confirm within 4 seconds the button resets automatically.
   *
   * @param {number} id
   * @param {HTMLTableRowElement} tr
   * @param {HTMLButtonElement} delBtn
   */
  _confirmDelete(id, tr, delBtn) {
    // Already in confirm state — ignore double-clicks
    if (delBtn.dataset.confirming) return;
    delBtn.dataset.confirming = '1';

    const original = delBtn.textContent;
    delBtn.textContent = 'Confirm?';
    delBtn.classList.add('btn-delete--confirming');

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = 'Cancel';
    delBtn.insertAdjacentElement('afterend', cancelBtn);

    /** Resets the button back to its original state. */
    const reset = () => {
      clearTimeout(timer);
      delBtn.textContent = original;
      delBtn.classList.remove('btn-delete--confirming');
      delete delBtn.dataset.confirming;
      cancelBtn.remove();
    };

    // Auto-reset after 4 seconds with no action
    const timer = setTimeout(reset, 4000);

    cancelBtn.addEventListener('click', reset);

    // Defer attaching the confirm listener so it doesn't fire on the current
    // click event that triggered the confirming state.
    setTimeout(() => {
    delBtn.addEventListener(
      'click',
      async () => {
        clearTimeout(timer);
        cancelBtn.remove();
        delBtn.disabled = true;
        delBtn.textContent = '…';
        try {
          const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete note');
          tr.remove();
          const remaining = this._tbody.querySelectorAll('tr').length;
          this._empty.hidden = remaining > 0;
          this.querySelector('.notes-table').hidden = remaining === 0;
        } catch (err) {
          reset();
          this._showStatus(err.message, 'error');
        }
      },
      { once: true }
    );
    }, 0);
  }

  /**
   * Replaces the note cell with an input for inline editing.
   * On confirm (Enter or blur), deletes the old note and inserts the new one.
   *
   * @param {HTMLTableCellElement} td
   * @param {{ id: number, content: string }} note
   */
  _startEdit(td, note) {
    if (td.querySelector('input')) return; // already editing

    const original = note.content;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = original;
    input.className = 'note-edit-input';
    td.textContent = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const confirm = async () => {
      const newContent = input.value.trim();
      if (!newContent || newContent === original) {
        td.textContent = original;
        td.title = 'Click to edit';
        td.addEventListener('click', () => this._startEdit(td, note));
        return;
      }
      try {
        await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
        await fetch(`/api/notes/${this._date}`, {
          body: JSON.stringify({ content: newContent }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
        await this._load();
      } catch (err) {
        this._showStatus(err.message, 'error');
        td.textContent = original;
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      if (e.key === 'Escape') { td.textContent = original; td.title = 'Click to edit'; }
    });
    input.addEventListener('blur', confirm);
  }

  /**
   * Displays a status message that auto-clears after 2 seconds.
   *
   * @param {string} message
   * @param {'error' | 'success'} type
   */
  _showStatus(message, type) {
    this._status.textContent = message;
    this._status.className = `status-message ${type}`;
    setTimeout(() => { this._status.textContent = ''; this._status.className = 'status-message'; }, 2000);
  }
}

customElements.define('work-notes-editor', WorkNotesEditor);
