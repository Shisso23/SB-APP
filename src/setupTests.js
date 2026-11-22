// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom implements no IntersectionObserver, which framer-motion's `whileInView`
// requires. Without this stub any component using viewport-triggered animation
// throws on mount in tests, even though it works fine in a real browser.
if (typeof global.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  global.IntersectionObserver = IntersectionObserverStub;
  window.IntersectionObserver = IntersectionObserverStub;
}
