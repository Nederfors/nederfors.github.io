const ssrDocument = {
  body: {},
  addEventListener() {},
  removeEventListener() {},
  activeElement: {
    blur() {},
    nodeName: ''
  },
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
  getElementById() {
    return null;
  },
  createEvent() {
    return {
      initEvent() {}
    };
  },
  createElement() {
    return {
      children: [],
      childNodes: [],
      style: {},
      setAttribute() {},
      getElementsByTagName() {
        return [];
      }
    };
  },
  createElementNS() {
    return {};
  },
  importNode() {
    return null;
  },
  location: {
    hash: '',
    host: '',
    hostname: '',
    href: '',
    origin: '',
    pathname: '',
    protocol: '',
    search: ''
  }
};

const ssrWindow = {
  document: ssrDocument,
  navigator: {
    userAgent: ''
  },
  location: ssrDocument.location,
  history: {
    replaceState() {},
    pushState() {},
    go() {},
    back() {}
  },
  CustomEvent: function CustomEvent() {
    return this;
  },
  addEventListener() {},
  removeEventListener() {},
  getComputedStyle() {
    return {
      getPropertyValue() {
        return '';
      }
    };
  },
  Image() {},
  Date,
  screen: {},
  setTimeout() {},
  clearTimeout() {},
  matchMedia() {
    return {};
  },
  requestAnimationFrame(callback) {
    return typeof setTimeout === 'function' ? setTimeout(callback, 0) : 0;
  },
  cancelAnimationFrame(id) {
    if (typeof clearTimeout === 'function') clearTimeout(id);
  }
};

function getDocument() {
  return typeof document !== 'undefined' ? document : ssrDocument;
}

function getWindow() {
  return typeof window !== 'undefined' ? window : ssrWindow;
}

export { getDocument, getWindow, ssrDocument, ssrWindow };
