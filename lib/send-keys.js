const {execFileSync} = require('child_process');
const options = {
    bin: '/usr/bin/xdotool',
};
const keyNames = {
    'backspace': 'BackSpace',
    'bs': 'BackSpace',
    '\b': 'BackSpace',
    'tab': 'Tab',
    '\t': 'Tab',
    'linefeed': 'Linefeed',
    'lf': 'Linefeed',
    '\n': 'Linefeed',
    'return': 'Return',
    'cr': 'Return',
    '\r': 'Return',
    'escape': 'Escape',
    'esc': 'Escape',
    'delete': 'Delete',
    'del': 'Delete',
    'home': 'Home',
    'left': 'Left',
    'up': 'Up',
    'right': 'Right',
    'down': 'Down',
    'pageup': 'Page_Up',
    'pgup': 'Page_Up',
    'pagedown': 'Page_Down',
    'pgdn': 'Page_Down',
    'end': 'End',
    ' ': 'space',
    '!': 'exclam',
    '"': 'quotedbl',
    '#': 'numbersign',
    '$': 'dollar',
    '%': 'percent',
    '&': 'ampersand',
    '\'' : 'apostrophe',
    '(': 'parenleft',
    ')': 'parenright',
    '*': 'asterisk',
    '+': 'plus',
    ',': 'comma',
    '-': 'minus',
    '.': 'period',
    '/': 'slash',
    ':': 'colon',
    ';': 'semicolon',
    '<': 'less',
    '=': 'equal',
    '>': 'greater',
    '?': 'question',
    '@': 'at',
    '[': 'bracketleft',
    '\\': 'backslash',
    ']': 'bracketright',
    '^': 'asciicircum',
    '_': 'underscore',
    '`': 'grave',
    '{': 'braceleft',
    '|': 'bar',
    '}': 'braceright',
    '~': 'asciitilde',
};

function getKeys(keyString) {
    return Array.isArray(keyString)? keyString : keyString.match(/{[^}]+}|./gs).map(fixKey);
}

function fixKey(rawKey) {
    let key = rawKey;
    let modifiers = /^[A-Z]$/.test(key) ? 'shift+' : '';
    key = key.toLowerCase().replace(/_/g, '');
    const m = rawKey.match(/^{((?:\w+\+)*)(\w+)}$/);
    if (m) {
        modifiers = m[1];
        key = m[2];
    }
    if (/^[a-z]|f\d\d?$/.test(key)) { // letters and function keys
        key = key.toUpperCase();
    }
    else {
        key = keyNames[key] || key;
    }
    return modifiers + key;
}

module.exports = {

    getWindowByPid(pid) {
        return execFileSync(options.bin, ['search', '--pid', pid], {encoding: 'utf-8'});
    },

    send(keyString, windowId) {
        const args = ['key']
            .concat(windowId ? ['--window', windowId] : [])
            .concat(getKeys(keyString));
        return execFileSync(options.bin, args);
    },

    setOptions(newOptions) {
        for (const key of Object.keys(newOptions)) {
            if (!options.hasOwnProperty(key)) {
                throw new Error(`Unknown option "${key}"`);
            }
            options[key] = newOptions[key];
        }
    },

};
