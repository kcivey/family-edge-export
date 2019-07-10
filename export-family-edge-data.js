#!/usr/bin/env node

const fs = require('fs').promises;
const util = require('util');
const os = require('os');
const {spawn} = require('child_process');
const moment = require('moment');
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
const dosBoxBin = '/usr/bin/dosbox';
const edgeDir = os.homedir() + '/dos/F-EDGE';
const outFile = edgeDir + '/DATA/' + moment().format('DMMMYY').toUpperCase() + '.DOC';

generateFile('person')
    .then(familyIds => generateFile('family', familyIds))
    .catch(console.error);

async function generateFile(type, familyIds) {
    await checkOutFile();
    const {pid, exitPromise} = await startDosBox();
    sendKeys.setWindowByPid(pid);
    sendKeys.send('F-EDGE.EXE\r'); // start Family Edge
    await pause(2000)();
    await (type === 'person' ? printPersonPages() : printFamilyPages(familyIds));
    sendKeys.send('qqqn'); // quit Family Edge
    await pause(500)();
    await quitDosBox();
    await exitPromise;
    return await finish(type);
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
    })
        .then(function (code) {
            if (code) {
                throw new Error(`DosBox process exited with code ${code}`);
            }
        });
    return pause(1000)({pid: fe.pid, exitPromise}); // wait for DosBox to start
}

async function printPersonPages() {
    const chunkSize = 10;
    const delay = pause(20); // pause 20 ms between records
    sendKeys.send(' u{shift+F7}');
    let prevSize = null;
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

async function printFamilyPages(familyIds) {
    const delay = pause(20); // pause 20 ms between records
    sendKeys.send(' u{shift+F4}');
    for (const familyId of familyIds) {
        const personIds = familyId.split('-');
        sendKeys.send('p' + personIds[0] + '\rs' + personIds[1] + '\r');
        await delay();
    }
}

function quitDosBox() {
    sendKeys.send('exit\r');
    return pause(200)();
}

async function finish(type) {
    const newFile = `${__dirname}/${type}.doc`;
    await fs.rename(outFile, newFile);
    console.log(`Output written to ${newFile}`);
    if (type === 'person') {
        const {personIds, familyIds} = await getIdsExported(newFile);
        const personIdList = numberList.stringify(personIds);
        console.log(`${personIds.length} persons exported: ${personIdList}`);
        if (!/^1-\d+$/.test(personIdList)) {
            throw new Error('Some persons were skipped');
        }
        return familyIds;
    }
}

async function getIdsExported(file) {
    const personIds = [];
    let familyIds = [];
    await eachLine(file, {separator: '\f', buffer: 4096}, function (page, last) {
        page = page.replace(/\r\n/g, '\n');
        const personId = extractPersonId(page);
        personIds.push(personId);
        const childFamilyId = getChildFamilyId(page);
        const newFamilyIds = getSpouseFamilyIds(page, personId).concat([childFamilyId]);
        for (const familyId of newFamilyIds) {
            if (familyId && !familyIds.includes(familyId)) {
                familyIds.push(familyId);
            }
        }
        return !last;
    });
    familyIds = familyIds.sort();
    return {personIds, familyIds};
}

function extractPersonId(page) {
    const m = page.match(/^\s*FULL NAME:.+\(#(\d+)\)$/m);
    if (!m) {
        throw new Error(`Person ID not found\n"${page}"`);
    }
    return +m[1];
}

function getChildFamilyId(page) {
    const patterns = [
        /^\s*FATHER:.+\(#(\d+)\)$/m,
        /^\s*MOTHER:.+\(#(\d+)\)$/m,
    ];
    const parentIds = [];
    for (const pattern of patterns) {
        const m = page.match(pattern);
        if (m) {
            parentIds.push(+m[1]);
        }
    }
    return makeFamilyId(parentIds);
}

function getSpouseFamilyIds(page, personId) {
    let familyIds = [];
    const m = page.match(/^ *SPOUSES: (.*(?:\n {10,}.+)*)$/m);
    if (m) {
        familyIds = extractIds(m[1])
            .map(spouseId => makeFamilyId([personId, spouseId]));
    }
    return familyIds;
}

function extractIds(s) {
    const ids = [];
    const pattern = /\(#(\d+)\)/g;
    let m;
    while ((m = pattern.exec(s))) {
        if (!ids.includes(m[1])) {
            ids.push(m[1]);
        }
    }
    return ids;
}

function makeFamilyId(ids) {
    if (ids.length === 0) {
        return null;
    }
    if (ids.length === 1) {
        ids.push(0);
    }
    else {
        ids = ids.sort((a, b) => a - b);
    }
    return ids.join('-');
}

function pause(delay) {
    return function (result) {
        return new Promise(resolve => setTimeout(() => resolve(result), delay));
    };
}
