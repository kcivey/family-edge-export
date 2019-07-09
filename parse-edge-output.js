#!/usr/bin/env node

const util = require('util');
const moment = require('moment');
const generateGedcom = require('generate-gedcom');
const eachLine = util.promisify(require('line-reader').eachLine);
const inFile = require('./lib/config').outFile;
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
    //console.log(record);
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
    let personId;
    let parents = [];
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
                    tree.push({tag: 'DATE', data: date});
                }
                if (place) {
                    tree.push({tag: 'PLAC', data: place});
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
                const ids = extractIds(value);
                for (const id of ids) {
                    data.tree.push({tag: 'FAMS', data: familyPointer(personId, id)});
                }
                break;
            }
            case 'FULL SIBL\'G':
            case 'CHILDREN':
                // skip
                break;
            default:
                console.warn(`Skipping ${key}`);
        }
    }
    if (parents.length) {
        data.tree.push({tag: 'FAMC', data: familyPointer(parents[0], parents[1])});
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

function familyPointer(id1, id2) {
    const ids = [id1 || Infinity, id2 || Infinity]
        .sort((a, b) => a - b)
        .map(n => n === Infinity ? 'X' : n)
        .join('-');
    return `@F${ids}@`;
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
        ids.push(m[1]);
    }
    return ids;
}

function fixData(data) {
    if (!Array.isArray(data)) {
        data = [data];
    }
    const newData = [];
    for (const record of data) {
        const newRecord = Object.assign(
            {pointer: '', data: '', tree: []},
            record,
        );
        newRecord.data = newRecord.data.replace(/\s+/g, ' ');
        if (newRecord.data.length > 64) {
            const parts = newRecord.data.match(/.{0,63}\S/g);
            newRecord.data = parts.shift();
            for (const part of parts) {
                newRecord.tree.push({tag: 'CONC', data: part});
            }
        }
        newRecord.tree = fixData(newRecord.tree);
        newData.push(newRecord);
    }
    return newData;
}