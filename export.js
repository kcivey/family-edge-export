#!/usr/bin/env node

const fs = require('fs').promises;
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

generatePersonFile()
    .catch(console.error);

function generatePersonFile() {
    return checkOutFile()
        .then(startDosBox)
        .then(pid => sendKeys.setWindowByPid(pid))
        .then(() => sendKeys.send('F-EDGE.EXE\r')) // start Family Edge
        .then(pause(2000))
        .then(printPages)
        .then(() => sendKeys.send('qqqn')) // quit Family Edge
        .then(pause(500))
        .then(quitDosBox);
}

function checkOutFile() {
    let promise = Promise.resolve();
    if (argv.delete) {
        promise = promise.then(() => fs.unlink(outFile))
            .catch(function (err) {
                if (err.code !== 'ENOENT') {
                    throw err;
                }
            });
    }
    return promise.then(() => fs.access(outFile))
        .then(
            function () {
                throw new Error(`${outFile} already exists`);
            },
            () => {}
        );
}

function startDosBox() {
    const fe = spawn(dosBoxBin, [edgeDir], {cwd: '.'});
    fe.stdout.setEncoding('utf-8').on('data', console.log);
    fe.stderr.setEncoding('utf-8').on('data', console.error);
    fe.on('close', finish);
    return pause(1000)(fe.pid); // wait for DosBox to start
}

async function printPages() {
    const chunkSize = 10;
    const delay = pause(20); // pause 20 ms between records
    let prevSize = null;
    sendKeys.send(' u{shift+F7}');
    for (let i = 1; i <= argv.limit; i++) {
        if (i % chunkSize === 0) {
            process.stderr.write(i + '\r');
            const size = (await fs.stat(outFile)).size;
            if (prevSize !== null && prevSize === size) {
                break;
            }
            prevSize = size;
        }
        sendKeys.send('p' + i + '\r');
        await delay();
    }
}

function quitDosBox() {
    sendKeys.send('exit\r');
    return pause(200)();
}

function finish(code) {
    if (code) {
        throw new Error(`DosBox process exited with code ${code}`);
    }
    const newFile = __dirname + '/persons.doc';
    fs.rename(outFile, newFile)
        .then(() => console.log(`Output written to ${newFile}`))
        .then(() => getIdsExported(newFile))
        .then(function (ids) {
            const idList = numberList.stringify(ids);
            console.log(`${ids.length} persons exported: ${idList}`);
            if (!/^1-\d+$/.test(idList)) {
                throw new Error('Some persons were skipped');
            }
        });
}

function getIdsExported(file) {
    const ids = [];
    return eachLine(file, function (line, last) {
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
