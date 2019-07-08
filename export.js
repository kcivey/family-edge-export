#!/usr/bin/env node

const os = require('os');
const childProcess = require('child_process');
const {spawn} = childProcess;
const sendKeys = require('./lib/send-keys');
const dosBoxBin = '/usr/bin/dosbox';
const edgeDir = os.homedir() + '/dos/F-EDGE';

const fe = spawn(dosBoxBin, [edgeDir], {cwd: edgeDir});
fe.stdout.setEncoding('utf-8').on('data', console.log);
fe.stderr.setEncoding('utf-8').on('data', console.error);
fe.on('close', code => console.log(`child process exited with code ${code}`));

Promise.resolve()
    .then(pause(1000)) // wait for DosBox to start
    .then(() => sendKeys.getWindowByPid(fe.pid))
    .then(windowId => sendKeys.send('F-EDGE.EXE\r', windowId))
    .then(pause(3000))
    .then(printPages)
    .catch(console.error);

function printPages() {
    sendKeys.send(' u{shift+F7}');
    for (let i = 1; i <= 10; i++) {
        sendKeys.send('p' + i + '\r');
    }
    sendKeys.send('qqqn');
}

function pause(delay) {
    return function (result) {
        return new Promise(resolve => setTimeout(() => resolve(result), delay));
    };
}
