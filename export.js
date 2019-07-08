#!/usr/bin/env node

const os = require('os');
const {spawn} = require('child_process');
const sendKeys = require('./lib/send-keys');
const dosBoxBin = '/usr/bin/dosbox';
const edgeDir = os.homedir() + '/dos/F-EDGE';

const fe = spawn(dosBoxBin, [edgeDir], {cwd: edgeDir});
fe.stdout.setEncoding('utf-8').on('data', console.log);
fe.stderr.setEncoding('utf-8').on('data', console.error);
fe.on('close', code => console.log(`child process exited with code ${code}`));

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
