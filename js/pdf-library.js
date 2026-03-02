// PDF Library popup

const PDF_LIST_URL = 'data/pdf-list.json';
const PDF_DIR = 'pdf/';

const normalizePdfPath = file => {
  if (typeof file !== 'string') return '';
  const trimmed = file.trim();
  if (!trimmed) return '';
  if (/^(https?:)?\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith(PDF_DIR)) return trimmed;
  if (trimmed.startsWith('data/')) {
    return `${PDF_DIR}${trimmed.slice('data/'.length)}`;
  }
  return `${PDF_DIR}${trimmed.replace(/^\/+/, '')}`;
};

const getPdfFileName = file => {
  const normalizedPath = normalizePdfPath(file);
  return decodeURIComponent(normalizedPath.split('/').pop() || normalizedPath);
};

const triggerPdfDownload = href => {
  const link = document.createElement('a');
  link.href = href;
  link.download = getPdfFileName(href);
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const createPdfItem = item => {
  const row = document.createElement('div');
  row.className = 'pdf-item';

  const copy = document.createElement('div');
  copy.className = 'pdf-item-copy';

  const title = document.createElement('strong');
  title.className = 'pdf-item-title';
  title.textContent = item.title || getPdfFileName(item.file);

  const meta = document.createElement('span');
  meta.className = 'pdf-item-meta';
  meta.textContent = getPdfFileName(item.file);

  copy.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'pdf-actions';

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'char-btn small';
  openButton.dataset.href = encodeURI(item.file);
  openButton.dataset.action = 'open';
  openButton.textContent = 'Öppna';

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'char-btn small pdf-download-btn';
  downloadButton.dataset.href = encodeURI(item.file);
  downloadButton.dataset.action = 'download';
  downloadButton.textContent = 'Hämta';

  actions.append(downloadButton, openButton);
  row.append(copy, actions);
  return row;
};

const getPdfMatches = (pdfs, query = '') => {
  const normalizedQuery = query.trim().toLocaleLowerCase('sv-SE');
  const matchesQuery = (item, category) => {
    if (!normalizedQuery) return true;
    const haystack = [category, item.title, getPdfFileName(item.file)]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('sv-SE');
    return haystack.includes(normalizedQuery);
  };

  const groups = [];
  let totalMatches = 0;

  (Array.isArray(pdfs) ? pdfs : []).forEach(category => {
    const items = (Array.isArray(category?.items) ? category.items : [])
      .map(item => ({
        ...item,
        file: normalizePdfPath(item?.file)
      }))
      .filter(item => item.file && matchesQuery(item, category?.category || ''));

    if (!items.length) return;
    groups.push({
      category: category?.category || 'PDF',
      items
    });
    totalMatches += items.length;
  });

  return { groups, totalMatches };
};

const renderPdfMatches = (list, summary, pdfs, query = '') => {
  const { groups, totalMatches } = getPdfMatches(pdfs, query);

  summary.textContent = totalMatches
    ? `${totalMatches} PDF-dokument i ${groups.length} kategorier`
    : 'Ingen PDF matchar sökningen.';

  list.textContent = '';

  if (groups.length) {
    groups.forEach(group => {
      const section = document.createElement('section');
      section.className = 'pdf-category';

      const header = document.createElement('div');
      header.className = 'pdf-category-header';

      const heading = document.createElement('h3');
      heading.textContent = group.category;

      const count = document.createElement('span');
      count.className = 'pdf-category-count';
      count.textContent = `${group.items.length} st`;

      header.append(heading, count);
      section.append(header);
      group.items.forEach(item => section.append(createPdfItem(item)));
      list.append(section);
    });
    return;
  }

  const emptyState = document.createElement('p');
  emptyState.className = 'pdf-library-empty';
  emptyState.textContent = 'Prova en annan sökterm eller öppna hela biblioteket.';
  list.append(emptyState);
};

const renderPdfLibrary = (container, pdfs) => {
  container.textContent = '';

  const shell = document.createElement('div');
  shell.className = 'pdf-library-shell';

  const toolbar = document.createElement('div');
  toolbar.className = 'pdf-library-toolbar';

  const searchLabel = document.createElement('label');
  searchLabel.className = 'pdf-field-label';
  searchLabel.setAttribute('for', 'pdfSearchInput');
  searchLabel.textContent = 'Sök i PDF-bank';

  const searchInput = document.createElement('input');
  searchInput.id = 'pdfSearchInput';
  searchInput.className = 'pdf-search-input';
  searchInput.type = 'search';
  searchInput.placeholder = 'Sök efter titel, kategori eller filnamn';
  searchInput.autocomplete = 'off';

  const summary = document.createElement('p');
  summary.className = 'pdf-library-summary';

  const list = document.createElement('div');
  list.className = 'pdf-library-groups';

  toolbar.append(searchLabel, searchInput, summary);
  shell.append(toolbar, list);
  container.append(shell);

  renderPdfMatches(list, summary, pdfs);

  searchInput.addEventListener('input', () => {
    renderPdfMatches(list, summary, pdfs, searchInput.value);
  });
};

const loadPdfLibrary = async () => {
  const response = await fetch(PDF_LIST_URL);
  if (!response.ok) {
    throw new Error(`Kunde inte lasa ${PDF_LIST_URL}`);
  }
  return response.json();
};

// The PDF button lives inside the shared-toolbar shadow DOM which makes
// `querySelectorAll` ineffective. `document.getElementById` is patched by
// the toolbar to also search its shadow root, so use it instead.
const pdfBtn = document.getElementById('pdfLibraryBtn');
pdfBtn?.addEventListener('click', async () => {
  const pop = document.getElementById('pdfPopup');
  const box = document.getElementById('pdfOptions');
  const cls = document.getElementById('pdfCancel');

  try {
    const pdfs = await loadPdfLibrary();
    renderPdfLibrary(box, pdfs);
  } catch (error) {
    box.textContent = '';
    const message = document.createElement('p');
    message.className = 'pdf-library-empty';
    message.textContent = 'PDF-listan kunde inte laddas just nu.';
    box.append(message);
  }

  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;

  function close() {
    pop.classList.remove('open');
    box.removeEventListener('click', onBtn);
    cls.removeEventListener('click', onCancel);
    pop.removeEventListener('click', onOutside);
  }

  function onBtn(e) {
    const button = e.target.closest('button[data-href][data-action]');
    if (!button) return;

    if (button.dataset.action === 'download') {
      triggerPdfDownload(button.dataset.href);
    } else {
      window.open(button.dataset.href, '_blank', 'noopener');
    }
    close();
  }

  function onCancel() {
    close();
  }

  function onOutside(e) {
    if (!pop.querySelector('.popup-inner').contains(e.target)) {
      close();
    }
  }

  box.addEventListener('click', onBtn);
  cls.addEventListener('click', onCancel);
  pop.addEventListener('click', onOutside);
});
