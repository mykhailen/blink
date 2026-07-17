import * as assert from "assert";
import { DoubleTapDetector, DOUBLE_TAP_WINDOW_MS } from "../provider/doubleTap.js";

suite("DoubleTapDetector", () => {
  test("first tap never fires", () => {
    const d = new DoubleTapDetector();
    assert.strictEqual(d.tap(1000), false);
  });

  test("second tap within the window fires", () => {
    const d = new DoubleTapDetector();
    d.tap(1000);
    assert.strictEqual(d.tap(1000 + DOUBLE_TAP_WINDOW_MS), true);
  });

  test("second tap after the window does not fire", () => {
    const d = new DoubleTapDetector();
    d.tap(1000);
    assert.strictEqual(d.tap(1000 + DOUBLE_TAP_WINDOW_MS + 1), false);
  });

  test("firing resets: a fast third tap does not fire again", () => {
    const d = new DoubleTapDetector();
    d.tap(1000);
    assert.strictEqual(d.tap(1100), true);
    assert.strictEqual(d.tap(1200), false);
  });

  test("after a reset, the next fast pair fires again", () => {
    const d = new DoubleTapDetector();
    d.tap(1000);
    d.tap(1100); // fires, resets
    d.tap(1200); // first tap of a new window
    assert.strictEqual(d.tap(1300), true);
  });

  test("a slow tap restarts the window", () => {
    const d = new DoubleTapDetector();
    d.tap(1000);
    d.tap(2000); // too slow — becomes the new first tap
    assert.strictEqual(d.tap(2100), true);
  });
});
