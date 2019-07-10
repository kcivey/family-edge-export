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

async function generatePersonFile() {
    await checkOutFile();
    const {pid, exitPromise} = await startDosBox();
    sendKeys.setWindowByPid(pid);
    sendKeys.send('F-EDGE.EXE\r'); // start Family Edge
    await pause(2000)();
    await printPages();
    sendKeys.send('qqqn'); // quit Family Edge
    await pause(500)();
    await quitDosBox();
    const code = await exitPromise;
    await finish(code);
}

async function checkOutFile() {
    if (argv.delete) {
        try {
            await fs.unlink(outFile);
        }
        catch (err) {
            if (err.code !== 'ENOENT') {
                throw err;
            }
        }
    }
    try {
        await fs.access(outFile);
    }
    catch (err) {
        return true;
    }
    throw new Error(`${outFile} already exists`);
}

function startDosBox() {
    const fe = spawn(dosBoxBin, [edgeDir], {cwd: '.'});
    fe.stdout.setEncoding('utf-8').on('data', console.log);
    fe.stderr.setEncoding('utf-8').on('data', console.error);
    const exitPromise = new Promise(function (resolve) {
        fe.on('close', resolve);
    });
    return pause(1000)({pid: fe.pid, exitPromise}); // wait for DosBox to start
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

async function finish(code) {
    if (code) {
        throw new Error(`DosBox process exited with code ${code}`);
    }
    const newFile = __dirname + '/persons.doc';
    await fs.rename(outFile, newFile);
    console.log(`Output written to ${newFile}`);
    const ids = await getIdsExported(newFile);
    const idList = numberList.stringify(ids);
    console.log(`${ids.length} persons exported: ${idList}`);
    if (!/^1-\d+$/.test(idList)) {
        throw new Error('Some persons were skipped');
    }
}

async function getIdsExported(file) {
    const ids = [];
    await eachLine(file, function (line, last) {
        const m = line.match(/^\s*FULL NAME:.+\(#(\d+)\)$/m);
        if (m) {
            ids.push(+m[1]);
        }
        return !last;
    });
    return ids;
}

function pause(delay) {
    return function (result) {
        return new Promise(resolve => setTimeout(() => resolve(result), delay));
    };
}
