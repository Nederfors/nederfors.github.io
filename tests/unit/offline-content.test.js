import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

class TestMessageChannel {
  constructor() {
    const port1 = {
      onmessage: null,
      close: vi.fn()
    };
    const port2 = {
      postMessage(value) {
        queueMicrotask(() => port1.onmessage?.({ data: value }));
      }
    };
    this.port1 = port1;
    this.port2 = port2;
  }
}

function loadOfflineContent({ controller = null, ready, requestAnimationFrame } = {}) {
  const serviceWorker = {
    controller,
    ready: ready || Promise.resolve({ active: controller }),
    addEventListener: vi.fn()
  };
  const window = {
    addEventListener: vi.fn(),
    clearTimeout,
    setTimeout,
    requestAnimationFrame
  };
  const source = readFileSync('js/offline-content.js', 'utf8')
    .replace('export default offlineContent;', 'window.__offlineContentForTest = offlineContent;');
  const context = vm.createContext({
    MessageChannel: TestMessageChannel,
    clearTimeout,
    console,
    crypto: globalThis.crypto,
    navigator: { serviceWorker },
    setTimeout,
    window
  });
  vm.runInContext(source, context);
  return { offlineContent: window.__offlineContentForTest, serviceWorker };
}

describe('offline foreground priority', () => {
  it('posts to an existing controller synchronously and waits for its pause acknowledgement', async () => {
    const events = [];
    let acknowledgePause = null;
    const controller = {
      postMessage(message, ports = []) {
        if (message.type === 'PAUSE_RULES_CACHE') {
          events.push('pause-posted');
          acknowledgePause = () => ports[0].postMessage({ ok: true, status: 'paused' });
        } else if (message.type === 'RESUME_RULES_CACHE') {
          events.push('resume-posted');
        }
      }
    };
    const { offlineContent } = loadOfflineContent({ controller });

    const operation = offlineContent.withForegroundPriority(() => {
      events.push('callback');
      return 'completed';
    }, { reason: 'catalog-add' });

    expect(events).toEqual(['pause-posted']);
    await Promise.resolve();
    expect(events).toEqual(['pause-posted']);

    acknowledgePause();
    await expect(operation).resolves.toBe('completed');
    expect(events).toEqual(['pause-posted', 'callback', 'resume-posted']);
  });

  it('does not wait for service-worker readiness when the page is not controlled', async () => {
    const events = [];
    const ready = new Promise(() => {});
    const { offlineContent } = loadOfflineContent({ ready });

    const operation = offlineContent.withForegroundPriority(() => {
      events.push('callback');
      return 'completed';
    });

    expect(events).toEqual(['callback']);
    await expect(operation).resolves.toBe('completed');
  });

  it('gives busy feedback a presentation opportunity before awaiting a controller', async () => {
    const events = [];
    let present = null;
    let acknowledgePause = null;
    const controller = {
      postMessage(message, ports = []) {
        if (message.type === 'PAUSE_RULES_CACHE') {
          events.push('pause-posted');
          acknowledgePause = () => ports[0].postMessage({ ok: true, status: 'paused' });
        } else if (message.type === 'RESUME_RULES_CACHE') {
          events.push('resume-posted');
        }
      }
    };
    const { offlineContent } = loadOfflineContent({
      controller,
      requestAnimationFrame: callback => {
        present = () => callback(16);
        return 1;
      }
    });

    const operation = offlineContent.withForegroundPriority(() => {
      events.push('callback');
      return 'completed';
    }, { reason: 'catalog-add', presentFeedback: true });

    expect(events).toEqual(['pause-posted']);
    acknowledgePause();
    await Promise.resolve();
    expect(events).toEqual(['pause-posted']);
    present();
    await expect(operation).resolves.toBe('completed');
    expect(events).toEqual(['pause-posted', 'callback', 'resume-posted']);
  });

  it('continues after the bounded acknowledgement timeout', async () => {
    const events = [];
    const controller = {
      postMessage(message) {
        events.push(message.type);
      }
    };
    const { offlineContent } = loadOfflineContent({ controller });

    const operation = offlineContent.withForegroundPriority(() => {
      events.push('callback');
      return 'completed';
    });

    expect(events).toEqual(['PAUSE_RULES_CACHE']);
    await expect(operation).resolves.toBe('completed');
    expect(events).toEqual(['PAUSE_RULES_CACHE', 'callback', 'RESUME_RULES_CACHE']);
  });
});
