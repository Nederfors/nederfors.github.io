import Swiper from '../../swiper-master/src/swiper.mjs';
import autoAnimate from '../vendor/auto-animate.js';

const autoControllers = new WeakMap();
const swipeBindings = new Map();

function matchMediaSafe(query) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(query);
}

function isTouchUi() {
  const coarse = matchMediaSafe('(pointer: coarse)');
  const noHover = matchMediaSafe('(hover: none)');
  return Boolean(coarse?.matches || noHover?.matches);
}

function prefersReducedMotion() {
  return Boolean(matchMediaSafe('(prefers-reduced-motion: reduce)')?.matches);
}

function defaultTouchProfile(type = '') {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'dialog') return 'none';
  if (normalized === 'picker' || normalized === 'form' || normalized === 'hub') {
    return 'sheet-down';
  }
  return 'sheet-down';
}

function destroyAutoAnimate(target) {
  const controller = autoControllers.get(target);
  if (!controller) return false;
  try { controller.destroy?.(); } catch {}
  autoControllers.delete(target);
  return true;
}

function bindAutoAnimate(target, options = {}) {
  if (!(target instanceof HTMLElement) || prefersReducedMotion()) {
    destroyAutoAnimate(target);
    return null;
  }
  destroyAutoAnimate(target);
  const controller = autoAnimate(target, options);
  if (!controller) return null;
  autoControllers.set(target, controller);
  return controller;
}

function ensureSwipeStructure(host, selector) {
  if (!(host instanceof HTMLElement)) return null;
  host.classList.add('daub-swipe-tabs', 'swiper');
  let wrapper = Array.from(host.children).find(child =>
    child instanceof HTMLElement && child.classList.contains('swiper-wrapper')
  ) || null;
  if (!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'swiper-wrapper';
    const slides = Array.from(host.children).filter(child =>
      child instanceof HTMLElement && child.matches(selector)
    );
    slides.forEach(slide => {
      slide.classList.add('swiper-slide');
      wrapper.appendChild(slide);
    });
    host.appendChild(wrapper);
  }
  Array.from(wrapper.children).forEach(child => {
    if (child instanceof HTMLElement) child.classList.add('swiper-slide');
  });
  return {
    container: host,
    wrapper,
    slides: Array.from(wrapper.children).filter(child => child instanceof HTMLElement)
  };
}

function destroySwipeTabs(key) {
  const binding = swipeBindings.get(key);
  if (!binding) return false;
  try { binding.swiper?.destroy?.(true, false); } catch {}
  if (binding.host instanceof HTMLElement) {
    binding.host.removeAttribute('data-swipe-tabs');
  }
  swipeBindings.delete(key);
  return true;
}

function bindSwipeTabs(key, config = {}) {
  const { host, selector, initialIndex = 0, onIndexChange, autoHeight = true, nested = false } = config;
  destroySwipeTabs(key);
  if (!isTouchUi() || !(host instanceof HTMLElement)) {
    if (host instanceof HTMLElement) host.removeAttribute('data-swipe-tabs');
    return null;
  }

  const prepared = ensureSwipeStructure(host, selector);
  if (!prepared) return null;

  host.dataset.swipeTabs = '1';

  const swiper = new Swiper(prepared.container, {
    initialSlide: Math.max(0, Number(initialIndex) || 0),
    slidesPerView: 1,
    spaceBetween: 0,
    speed: 180,
    threshold: 8,
    resistanceRatio: 0.7,
    autoHeight,
    nested,
    observer: true,
    observeParents: true,
    observeSlideChildren: true,
    allowTouchMove: true,
    touchStartPreventDefault: false,
    on: {
      slideChange(instance) {
        onIndexChange?.(instance.activeIndex, 'swipe', instance);
      }
    }
  });

  const binding = {
    key,
    host,
    swiper,
    slides: prepared.slides
  };
  swipeBindings.set(key, binding);
  return binding;
}

function slideTabsTo(key, index, options = {}) {
  const binding = swipeBindings.get(key);
  if (!binding?.swiper || binding.swiper.destroyed) return false;
  const nextIndex = Math.max(0, Number(index) || 0);
  const duration = options.animate === false ? 0 : undefined;
  if (binding.swiper.activeIndex !== nextIndex) {
    binding.swiper.slideTo(nextIndex, duration);
  } else {
    binding.swiper.updateAutoHeight?.(0);
  }
  return true;
}

function refreshSwipeTabs(key) {
  const binding = swipeBindings.get(key);
  if (!binding?.swiper || binding.swiper.destroyed) return false;
  binding.swiper.update?.();
  binding.swiper.updateAutoHeight?.(0);
  return true;
}

function hasSwipeTabs(key) {
  return swipeBindings.has(key);
}

const daubMotion = Object.freeze({
  isTouchUi,
  prefersReducedMotion,
  defaultTouchProfile,
  bindAutoAnimate,
  destroyAutoAnimate,
  bindSwipeTabs,
  destroySwipeTabs,
  slideTabsTo,
  refreshSwipeTabs,
  hasSwipeTabs
});

window.daubMotion = daubMotion;

export default daubMotion;
