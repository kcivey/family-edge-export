const {format} = require('util');
const c = require('ansi-colors');
const theme = {
    error: c.red,
    info: c.cyan,
    success: c.green,
    warn: c.yellow,
};
let useStderr = true;
const log = function () {
    return write('', ...arguments);
};

c.theme(theme);

function write(style, ...args) {
    const log = useStderr ? console.warn : console.log;
    const useColors = style ? process[useStderr ? 'stderr' : 'stdout'].isTTY : false;
    const wrap = useColors ? style : v => v;
    return log(...args.map(arg => wrap(format(arg))));
}

log.useStderr = function (value) {
    useStderr = value;
};

for (const [name, style] of Object.entries(theme)) {
    log[name] = function () {
        return write(style, ...arguments);
    };
}

module.exports = log;
