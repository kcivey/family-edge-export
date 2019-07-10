#!/usr/bin/env node

const util = require('util');
const moment = require('moment');
const generateGedcom = require('generate-gedcom');
const eachLine = util.promisify(require('line-reader').eachLine);
const inFile = __dirname + '/persons.doc';
const sexById = {}; // sex of persons by ID

printHeaderRecord();

let count = 0;
eachLine(inFile, {separator: '\f', buffer: 4096}, function (page, last) {
    page = page.replace(/\r\n/g, '\n')
        .replace(/^.+\n=+\n/, '')
        .replace(/\nFrom: .+$/s, '\n');
    const record = {};
    let m = page.match(/\n-- SOURCES -+\n(.+)$/s);
    if (m) {
        const sourceText = m[1];
        page = page.substr(0, page.length - m[0].length);
        const sources = {};
        const pattern = /([^.]+)\.{2,}(.+)\n/y;
        let pos = 0;
        while ((m = pattern.exec(sourceText))) {
            sources[m[1]] = m[2].trim();
            pos = pattern.lastIndex;
        }
        if (pos !== sourceText.length) {
            throw new Error(`Unexpected format in sources "${sourceText.substr(pos)}"`);
        }
        record['SOURCES'] = sources;
    }
    m = page.match(/\n-- HISTORY NOTES -+\n(.+)$/s);
    if (m) {
        record['HISTORY NOTES'] = m[1].trim();
        page = page.substr(0, page.length - m[0].length);
    }
    const pattern = / *([^:]+): (.*(?:\n {10,}.+)*)\n/y;
    let pos = 0;
    while ((m = pattern.exec(page))) {
        record[m[1]] = m[2].trim();
        pos = pattern.lastIndex;
    }
    if (pos !== page.length) {
        throw new Error(`Unexpected format at end of page "${page.substr(pos)}"`);
    }
    printPersonRecord(record);
    count++;
    return !last;
})
    .then(() => console.log(count))
    .catch(console.error);

function printHeaderRecord() {
    printRecord({
        tag: 'HEAD',
        tree: [
            {
                tag: 'CHAR',
                data: 'UTF-8',
            },
            {
                tag: 'SOUR',
                data: 'The Family Edge Plus',
                tree: [
                    {
                        tag: 'VERS',
                        data: '2.5b',
                    },
                ],
            },
            {
                tag: 'GEDC',
                tree: [
                    {
                        tag: 'VERS',
                        data: '5.5',
                    },
                    {
                        tag: 'FORM',
                        data: 'LINEAGE-LINKED',
                    },
                ],
            },
            {
                tag: 'DATE',
                data: moment().utc().format('DD MMM YYYY').toUpperCase(),
                tree: [
                    {
                        tag: 'TIME',
                        data: moment().utc().format('HH:mm:ss'),
                    },
                ],
            },
        ],
    });
}

function printPersonRecord(properties) {
    const data = {tree: []};
    const parents = [];
    const sources = properties['SOURCES'] || {};
    if (properties['TOMBSTONE'] && !properties['BURIED']) {
        properties['BURIED'] = '';
    }
    let personId;
    for (const [key, value] of Object.entries(properties)) {
        switch (key) {
            case 'FULL NAME': {
                const {name, id} = parseName(value);
                data.pointer = personPointer(id);
                data.tag = 'INDI';
                data.tree.push({tag: 'NAME', data: name});
                if (sexById[id]) {
                    data.tree.push({tag: 'SEX', data: sexById[id]});
                }
                if (sources['Name']) {
                    data.tree.push({tag: 'SOUR', tree: [{tag: 'TITL', data: sources['Name']}]});
                }
                personId = id;
                break;
            }
            case 'BORN':
            case 'DIED':
            case 'BURIED':
            case 'LOCATION':
            case 'CHRISTENED': {
                const tag = {
                    BORN: 'BIRT',
                    DIED: 'DEAT',
                    BURIED: 'BURI',
                    LOCATION: 'RESI',
                    CHRISTENED: 'CHR',
                }[key];
                const {date, place} = parseDatePlace(value);
                const tree = [];
                if (date) {
                    const type = {BORN: 'Birth', DIED: 'Death'}[key];
                    const dateTree = [];
                    if (type && sources[type]) {
                        dateTree.push({tag: 'SOUR', tree: [{tag: 'TITL', data: sources[type]}]});
                    }
                    tree.push({tag: 'DATE', data: date, tree: dateTree});
                }
                if (place) {
                    const type = {BORN: 'BPlace', DIED: 'DPlace'}[key];
                    const placeTree = [];
                    if (type && sources[type]) {
                        placeTree.push({tag: 'SOUR', tree: [{tag: 'TITL', data: sources[type]}]});
                    }
                    tree.push({tag: 'PLAC', data: place, tree: placeTree});
                }
                if (key === 'BURIED' && properties['TOMBSTONE']) {
                    tree.push({tag: 'NOTE', data: 'Gravestone: ' + properties['TOMBSTONE'].replace(/;?\.?$/, '')});
                }
                data.tree.push({tag, tree});
                break;
            }
            case 'OCCUPATION':
                data.tree.push(
                    {
                        tag: 'OCCU',
                        tree: [{tag: 'TYPE', data: value}],
                    }
                );
                break;
            case 'NOTE':
            case 'HISTORY NOTES':
                data.tree.push({tag: 'NOTE', data: value});
                break;
            case 'FATHER':
            case 'MOTHER': {
                const {id} = parseName(value);
                if (id) {
                    sexById[id] = key === 'FATHER' ? 'M' : 'F';
                    parents.push(id);
                }
                break;
            }
            case 'SPOUSES': {
                const spouseIds = extractIds(value);
                for (const spouseId of spouseIds) {
                    data.tree.push({tag: 'FAMS', data: familyPointer([personId, spouseId])});
                }
                break;
            }
            case 'SOURCES':
            case 'TOMBSTONE':
            case 'FULL SIBL\'G':
            case 'CHILDREN':
                // skip
                break;
            default:
                console.warn(`Skipping ${key}`);
        }
    }
    if (parents.length) {
        data.tree.push({tag: 'FAMC', data: familyPointer(parents)});
    }
    for (const type of ['Father', 'Mother', 'Other']) {
        if (sources[type]) {
            data.tree.push({
                tag: 'SOUR',
                tree: [
                    {tag: 'TITL', data: sources[type]},
                    {tag: 'NOTE', data: type},
                ],
            });
        }
    }
    printRecord(data);
}

function parseName(s) {
    if (!s) {
        return {};
    }
    const m = s.match(/^(.+) \(#(\d+)\)$/);
    if (!m) {
        throw new Error(`Unexpected person format "${s}"`);
    }
    const id = m[2];
    const name = m[1].replace(/\b[A-Z'-]{2,}(?:\b \b[A-Z'-]{2,})*\b|\?{3}$/,
        surname => '/' + titleCase(surname) + '/');
    return {name, id};
}

function titleCase(s) {
    return s.replace(/[^\W_]+/, initialCap)
        .replace(/^(Mc)(\w+)/, (m, m1, m2) => m1 + initialCap(m2));
}

function initialCap(s) {
    return s.substr(0, 1).toUpperCase() + s.substr(1).toLowerCase();
}

function personPointer(id) {
    return `@P${id}@`;
}

function familyPointer(ids) {
    if (ids.length === 1) {
        ids[1] = 0;
    }
    else {
        ids = ids.sort((a, b) => a - b);
    }
    return '@F' + ids.join('-') + '@';
}


function printRecord(data) {
    process.stdout.write(generateGedcom(fixData(data)) + '\n');
}

function parseDatePlace(s) {
    const m = s.replace(/\s+/g, ' ')
        .match(/^(?:living )?(?:(?:(circa|roughly) )?((?:(?:\d\d? )?\w{3} )?\d{4}(?:\/\d\d?)?))? ?(.*?)\.?$/);
    if (!m) {
        throw new Error(`Unexpected date-place format "${s}"`);
    }
    const prefix = m[1] && (m[1] === 'roughly' ? 'EST' : 'ABT');
    let date = m[2] && m[2].toUpperCase();
    const place = m[3] && m[3].replace(/,? ([A-Z]{2})$/, ', $1');
    if (date && prefix) {
        date = prefix + ' ' + date;
    }
    return {date, place};
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

function fixData(data) {
    if (!Array.isArray(data)) {
        data = [data];
    }
    const maxLineLength = 80;
    const newData = [];
    for (const record of data) {
        const newRecord = Object.assign(
            {pointer: '', data: '', tree: []},
            record,
        );
        let allowedLength = maxLineLength - newRecord.tag.length - 3;
        if (newRecord.pointer) {
            allowedLength -= newRecord.pointer.length - 1;
        }
        newRecord.data = newRecord.data.replace(/\s+/g, ' ');
        let note = '';
        const m = newRecord.tag !== 'NOTE' && newRecord.data.match(/;? \[NOTE: ([^\]]+)]$/);
        if (m) {
            note = m[1];
            newRecord.data = newRecord.data.substr(0, newRecord.data.length - m[0].length);
        }
        if (newRecord.data.length > allowedLength) {
            const re = new RegExp(`.{0,${allowedLength - 1}}\\S`, 'g');
            const parts = newRecord.data.match(re);
            newRecord.data = parts.shift();
            for (const part of parts) {
                newRecord.tree.push({tag: 'CONC', data: part});
            }
        }
        if (note) {
            newRecord.tree.push({tag: 'NOTE', data: note});
        }
        newRecord.tree = fixData(newRecord.tree);
        newData.push(newRecord);
    }
    return newData;
}
