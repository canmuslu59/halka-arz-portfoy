// legacy-webview source=scripts/legacy-webview/polyfills.js blob=cc8a5978ffe408f6a69f72e28e43ad9074ae6ebc esbuild=0.25.11 target=chrome64 — scripts/build-legacy-webview.mjs üretir, elle düzenlemeyin.
const root = typeof globalThis === "object" && globalThis ? globalThis : self;
function define(target, name, value) {
  if (!target || typeof target[name] === "function") return;
  Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
}
if (typeof globalThis === "undefined") {
  Object.defineProperty(root, "globalThis", { value: root, writable: true, configurable: true, enumerable: false });
}
define(Object, "fromEntries", function fromEntries(entries) {
  const result = {};
  for (const entry of entries) {
    if (Object(entry) !== entry) throw new TypeError("Iterator value " + entry + " is not an entry object");
    Object.defineProperty(result, entry[0], { value: entry[1], writable: true, enumerable: true, configurable: true });
  }
  return result;
});
define(Promise, "allSettled", function allSettled(iterable) {
  const C = typeof this === "function" ? this : Promise;
  return C.all(Array.from(iterable, (item) => C.resolve(item).then(
    (value) => ({ status: "fulfilled", value }),
    (reason) => ({ status: "rejected", reason })
  )));
});
function flattenInto(target, source, depth) {
  const length = source.length >>> 0;
  for (let index = 0; index < length; index++) {
    if (!(index in source)) continue;
    const item = source[index];
    if (depth > 0 && Array.isArray(item)) flattenInto(target, item, depth - 1);
    else target.push(item);
  }
  return target;
}
define(Array.prototype, "flat", function flat(depth) {
  const level = depth === void 0 ? 1 : Math.trunc(Number(depth)) || 0;
  return flattenInto([], Object(this), level);
});
define(Array.prototype, "flatMap", function flatMap(callback, thisArg) {
  if (typeof callback !== "function") throw new TypeError("flatMap callback must be a function");
  return flattenInto([], Array.prototype.map.call(Object(this), callback, thisArg), 1);
});
function advanceIndex(text, index, unicode) {
  if (!unicode || index + 1 >= text.length) return index + 1;
  const first = text.charCodeAt(index);
  const second = text.charCodeAt(index + 1);
  return first >= 55296 && first <= 56319 && second >= 56320 && second <= 57343 ? index + 2 : index + 1;
}
define(String.prototype, "matchAll", function matchAll(regexp) {
  if (this == null) throw new TypeError("String.prototype.matchAll called on null or undefined");
  const text = String(this);
  let matcher;
  if (regexp instanceof RegExp) {
    if (regexp.flags.indexOf("g") === -1) throw new TypeError("String.prototype.matchAll called with a non-global RegExp argument");
    matcher = new RegExp(regexp.source, regexp.flags);
    matcher.lastIndex = regexp.lastIndex;
  } else {
    matcher = new RegExp(regexp === void 0 ? "" : regexp, "g");
  }
  return (function* matches() {
    let match;
    while ((match = matcher.exec(text)) !== null) {
      if (match[0] === "") matcher.lastIndex = advanceIndex(text, matcher.lastIndex, matcher.unicode);
      yield match;
    }
  })();
});
const cryptoObject = root.crypto;
if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
  define(cryptoObject, "randomUUID", function randomUUID() {
    const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
    bytes[6] = bytes[6] & 15 | 64;
    bytes[8] = bytes[8] & 63 | 128;
    const hex = Array.from(bytes, (byte) => (byte + 256).toString(16).slice(1)).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  });
}
(function patchHourCycle() {
  const NativeDateTimeFormat = Intl.DateTimeFormat;
  let supported = true;
  try {
    supported = new NativeDateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23" }).resolvedOptions().hourCycle === "h23";
  } catch (error) {
    supported = true;
  }
  if (supported) return;
  function translate(options) {
    if (!options || options.hourCycle === void 0 || options.hour12 !== void 0) return options;
    const copy = Object.assign({}, options);
    copy.hour12 = copy.hourCycle === "h11" || copy.hourCycle === "h12";
    delete copy.hourCycle;
    return copy;
  }
  function DateTimeFormat(locales, options) {
    return new NativeDateTimeFormat(locales, translate(options));
  }
  DateTimeFormat.prototype = NativeDateTimeFormat.prototype;
  DateTimeFormat.supportedLocalesOf = NativeDateTimeFormat.supportedLocalesOf;
  Object.defineProperty(Intl, "DateTimeFormat", { value: DateTimeFormat, writable: true, configurable: true, enumerable: false });
})();
(function patchSignDisplay() {
  const NativeNumberFormat = Intl.NumberFormat;
  let supported = true;
  try {
    supported = new NativeNumberFormat("en-US", { signDisplay: "always" }).resolvedOptions().signDisplay === "always";
  } catch (error) {
    supported = true;
  }
  if (supported) return;
  function NumberFormat(locales, options) {
    const formatter = new NativeNumberFormat(locales, options);
    const mode = options && options.signDisplay;
    if (mode !== "always" && mode !== "exceptZero") return formatter;
    const nativeFormat = formatter.format;
    Object.defineProperty(formatter, "format", {
      configurable: true,
      value(number) {
        const text = nativeFormat(number);
        const value = Number(number);
        const positive = value > 0 || mode === "always" && value === 0 && !Object.is(value, -0);
        return positive && !/^[+\-−]/.test(text) ? "+" + text : text;
      }
    });
    return formatter;
  }
  NumberFormat.prototype = NativeNumberFormat.prototype;
  NumberFormat.supportedLocalesOf = NativeNumberFormat.supportedLocalesOf;
  Object.defineProperty(Intl, "NumberFormat", { value: NumberFormat, writable: true, configurable: true, enumerable: false });
})();
