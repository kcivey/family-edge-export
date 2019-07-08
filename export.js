#!/usr/bin/env node

const os = require('os');
const fs = require('fs');
const {spawn} = require('child_process');
const moment = require('moment');
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
const dosBoxBin = '/usr/bin/dosbox';
const edgeDir = os.homedir() + '/dos/F-EDGE';
const outFile = edgeDir + '/DATA/' + moment().format('DMMMYY').toUpperCase() + '.DOC';

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

function printPages() {
    const chunkSize = 100;
    let prevSize = null;
    sendKeys.send(' u{shift+F7}');
    for (let i = 1; i <= argv.limit; i++) {
        if (i % chunkSize === 0) {
            const size = fs.statSync(outFile).size;
            if (prevSize !== null && prevSize === size) {
                break;
            }
            prevSize = size;
        }
        sendKeys.send('p' + i + '\r');
    }
    sendKeys.send('qqqn');
}

function pause(delay) {
    return function (result) {
        return new Promise(resolve => setTimeout(() => resolve(result), delay));
    };
}
