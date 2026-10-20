// Eski Android WebView'lerde (Chrome 64–91) www kodunun kullandığı ama motorda olmayan API'ler.
// scripts/build-legacy-webview.mjs bu dosyayı www/legacy/legacy-polyfills.js olarak üretir; yalnız
// MainActivity eski WebView algıladığında, giriş modüllerinin ilk import'u olarak yüklenir.
// Her parça yalnız eksikse kurulur; güncel WebView'de hiçbir şeye dokunmaz.

const root = typeof globalThis === 'object' && globalThis ? globalThis : self;

function define(target, name, value) {
  if (!target || typeof target[name] === 'function') return;
  Object.defineProperty(target, name, { value, writable:true, configurable:true, enumerable:false });
}

// globalThis — Chrome 71
if (typeof globalThis === 'undefined') {
  Object.defineProperty(root, 'globalThis', { value:root, writable:true, configurable:true, enumerable:false });
}

// Object.fromEntries — Chrome 73
define(Object, 'fromEntries', function fromEntries(entries) {
  const result = {};
  for (const entry of entries) {
    if (Object(entry) !== entry) throw new TypeError('Iterator value ' + entry + ' is not an entry object');
    Object.defineProperty(result, entry[0], { value:entry[1], writable:true, enumerable:true, configurable:true });
  }
  return result;
});

// Promise.allSettled — Chrome 76
define(Promise, 'allSettled', function allSettled(iterable) {
  const C = typeof this === 'function' ? this : Promise;
  return C.all(Array.from(iterable, item => C.resolve(item).then(
    value => ({ status:'fulfilled', value }),
    reason => ({ status:'rejected', reason }),
  )));
});

// Array.prototype.flat / flatMap — Chrome 69
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
define(Array.prototype, 'flat', function flat(depth) {
  const level = depth === undefined ? 1 : Math.trunc(Number(depth)) || 0;
  return flattenInto([], Object(this), level);
});
define(Array.prototype, 'flatMap', function flatMap(callback, thisArg) {
  if (typeof callback !== 'function') throw new TypeError('flatMap callback must be a function');
  return flattenInto([], Array.prototype.map.call(Object(this), callback, thisArg), 1);
});

// String.prototype.matchAll — Chrome 73
function advanceIndex(text, index, unicode) {
  if (!unicode || index + 1 >= text.length) return index + 1;
  const first = text.charCodeAt(index);
  const second = text.charCodeAt(index + 1);
  return first >= 0xd800 && first <= 0xdbff && second >= 0xdc00 && second <= 0xdfff ? index + 2 : index + 1;
}
define(String.prototype, 'matchAll', function matchAll(regexp) {
  if (this == null) throw new TypeError('String.prototype.matchAll called on null or undefined');
  const text = String(this);
  let matcher;
  if (regexp instanceof RegExp) {
    if (regexp.flags.indexOf('g') === -1) throw new TypeError('String.prototype.matchAll called with a non-global RegExp argument');
    matcher = new RegExp(regexp.source, regexp.flags);
    matcher.lastIndex = regexp.lastIndex;
  } else {
    matcher = new RegExp(regexp === undefined ? '' : regexp, 'g');
  }
  return (function* matches() {
    let match;
    while ((match = matcher.exec(text)) !== null) {
      if (match[0] === '') matcher.lastIndex = advanceIndex(text, matcher.lastIndex, matcher.unicode);
      yield match;
    }
  })();
});

// crypto.randomUUID — Chrome 92
const cryptoObject = root.crypto;
if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
  define(cryptoObject, 'randomUUID', function randomUUID() {
    const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => (byte + 0x100).toString(16).slice(1)).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  });
}

// Intl.DateTimeFormat hourCycle — Chrome 73. Desteklenmezse sessizce yok sayılır ve en-US 12 saatlik
// biçime düşer (market-calendar.js'te 14:00 → "02"); hour12 karşılığına çevrilir.
(function patchHourCycle() {
  const NativeDateTimeFormat = Intl.DateTimeFormat;
  let supported = true;
  try {
    supported = new NativeDateTimeFormat('en-US', { hour:'numeric', hourCycle:'h23' }).resolvedOptions().hourCycle === 'h23';
  } catch (error) {
    supported = true;
  }
  if (supported) return;
  function translate(options) {
    if (!options || options.hourCycle === undefined || options.hour12 !== undefined) return options;
    const copy = Object.assign({}, options);
    copy.hour12 = copy.hourCycle === 'h11' || copy.hourCycle === 'h12';
    delete copy.hourCycle;
    return copy;
  }
  function DateTimeFormat(locales, options) {
    return new NativeDateTimeFormat(locales, translate(options));
  }
  DateTimeFormat.prototype = NativeDateTimeFormat.prototype;
  DateTimeFormat.supportedLocalesOf = NativeDateTimeFormat.supportedLocalesOf;
  Object.defineProperty(Intl, 'DateTimeFormat', { value:DateTimeFormat, writable:true, configurable:true, enumerable:false });
})();

// Intl.NumberFormat signDisplay — Chrome 77. Desteklenmezse yüzdelerde "+" işareti kaybolur.
(function patchSignDisplay() {
  const NativeNumberFormat = Intl.NumberFormat;
  let supported = true;
  try {
    supported = new NativeNumberFormat('en-US', { signDisplay:'always' }).resolvedOptions().signDisplay === 'always';
  } catch (error) {
    supported = true;
  }
  if (supported) return;
  function NumberFormat(locales, options) {
    const formatter = new NativeNumberFormat(locales, options);
    const mode = options && options.signDisplay;
    if (mode !== 'always' && mode !== 'exceptZero') return formatter;
    const nativeFormat = formatter.format;
    Object.defineProperty(formatter, 'format', {
      configurable:true,
      value(number) {
        const text = nativeFormat(number);
        const value = Number(number);
        const positive = value > 0 || (mode === 'always' && value === 0 && !Object.is(value, -0));
        return positive && !/^[+\-−]/.test(text) ? '+' + text : text;
      },
    });
    return formatter;
  }
  NumberFormat.prototype = NativeNumberFormat.prototype;
  NumberFormat.supportedLocalesOf = NativeNumberFormat.supportedLocalesOf;
  Object.defineProperty(Intl, 'NumberFormat', { value:NumberFormat, writable:true, configurable:true, enumerable:false });
})();
