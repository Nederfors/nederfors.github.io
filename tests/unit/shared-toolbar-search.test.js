import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function loadSharedToolbar() {
  let ToolbarClass = null;
  class FakeHTMLElement {
    attachShadow() {
      this.shadowRoot = {};
      return this.shadowRoot;
    }
  }
  const window = {
    iconHtml: () => '',
    inventoryPopupRegistry: null,
    localStorage: {}
  };
  const context = vm.createContext({
    window,
    HTMLElement: FakeHTMLElement,
    customElements: {
      define(_name, constructor) {
        ToolbarClass = constructor;
      }
    },
    console,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(readFileSync('js/shared-toolbar.js', 'utf8'), context);
  return { ToolbarClass, window };
}

function createKeyboardFixture({ active = true, hidden = false, selectResult = true } = {}) {
  const { ToolbarClass, window } = loadSharedToolbar();
  const toolbar = new ToolbarClass();
  const search = { focus: vi.fn() };
  const activeOption = active ? {} : null;
  const suggestions = {
    hidden,
    querySelector: vi.fn(() => activeOption)
  };
  toolbar.shadowRoot = {
    getElementById(id) {
      if (id === 'searchField') return search;
      if (id === 'searchSuggest') return suggestions;
      return null;
    }
  };
  const selectActiveSuggestion = vi.fn(function selectActiveSuggestion() {
    return this === window.globalSearch && selectResult;
  });
  window.globalSearch = { selectActiveSuggestion };
  const event = {
    key: 'Enter',
    target: search,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn()
  };
  return { toolbar, search, suggestions, selectActiveSuggestion, event };
}

describe('shared toolbar search combobox Enter behavior', () => {
  it('selects the active option and blocks the later raw-submit listener', () => {
    const fixture = createKeyboardFixture();

    expect(fixture.toolbar.handleSearchComboboxKeydown(fixture.event)).toBe(true);
    expect(fixture.suggestions.querySelector).toHaveBeenCalledWith('.item.active');
    expect(fixture.selectActiveSuggestion).toHaveBeenCalledTimes(1);
    expect(fixture.event.preventDefault).toHaveBeenCalledTimes(1);
    expect(fixture.event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(fixture.search.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('leaves Enter untouched when no suggestion is active', () => {
    const fixture = createKeyboardFixture({ active: false });

    expect(fixture.toolbar.handleSearchComboboxKeydown(fixture.event)).toBe(false);
    expect(fixture.selectActiveSuggestion).not.toHaveBeenCalled();
    expect(fixture.event.preventDefault).not.toHaveBeenCalled();
    expect(fixture.event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(fixture.search.focus).not.toHaveBeenCalled();
  });

  it('preserves raw submission when active-option selection cannot complete', () => {
    const fixture = createKeyboardFixture({ selectResult: false });

    expect(fixture.toolbar.handleSearchComboboxKeydown(fixture.event)).toBe(false);
    expect(fixture.selectActiveSuggestion).toHaveBeenCalledTimes(1);
    expect(fixture.event.preventDefault).not.toHaveBeenCalled();
    expect(fixture.event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(fixture.search.focus).not.toHaveBeenCalled();
  });
});
