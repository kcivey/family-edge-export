#!/usr/bin/env node

const fs = require('fs');
const util = require('util');
const {spawn} = require('child_process');
const numberList = require('number-list');
const eachLine = util.promisify(require('line-reader').eachLine);
const argv = require('yargs')
    .options({
        limit: {
            type: 'number',
            describe: 'max number of persons to export',
            default: Infinity,
        },
        delete: {
            type: 'boolean',
            describe: 'delete existing output file first',
        },
    })
    .strict(true)
    .argv;
const sendKeys = require('./lib/send-keys');
const {dosBoxBin, edgeDir, outFile} = require('./lib/config');

if (argv.delete) {
    try {
        fs.unlinkSync(outFile);
    }
    catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }
    }
}

const fe = spawn(dosBoxBin, [edgeDir], {cwd: edgeDir});
fe.stdout.setEncoding('utf-8').on('data', console.log);
fe.stderr.setEncoding('utf-8').on('data', console.error);
fe.on('close', function (code) {
    console.log(`DosBox process exited with code ${code}`);
    console.log(`Output written to ${outFile}`);
    getIdsExported()
        .then(function (ids) {
            const idList = numberList.stringify(ids);
            console.log(`Exported IDs ${idList}`);
        });
});

Promise.resolve()
    .then(pause(1000)) // wait for DosBox to start
    .then(() => sendKeys.setWindowByPid(fe.pid))
    .then(() => sendKeys.send('F-EDGE.EXE\r'))
    .then(pause(2000))
    .then(printPages)
    .then(pause(500))
    .then(() => sendKeys.send('exit\r'))
    .catch(console.error);

async function printPages() {
    const chunkSize = 100;
    const delay = pause(20); // pause 20 ms between records
    let prevSize = null;
    sendKeys.send(' u{shift+F7}');
    for (let i = 1; i <= argv.limit; i++) {
        if (i % chunkSize === 0) {
            console.log(i);
            const size = fs.statSync(outFile).size;
            if (prevSize !== null && prevSize === size) {
                break;
            }
            prevSize = size;
        }
        sendKeys.send('p' + i + '\r');
        await delay();
    }
    sendKeys.send('qqqn');
}

function getIdsExported() {
    const ids = [];
    return eachLine(outFile, function (line, last) {
        const m = line.match(/^\s*FULL NAME:.+\(#(\d+)\)$/m);
        if (m) {
            ids.push(+m[1]);
        }
        return !last;
    }).then(() => ids);
}

function pause(delay) {
    return function (result) {
        return new Promise(resolve => setTimeout(() => resolve(result), delay));
    };
}
