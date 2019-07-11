#!/usr/bin/env node

const util = require('util');
const moment = require('moment');
const generateGedcom = require('generate-gedcom');
const eachLine = util.promisify(require('line-reader').eachLine);
const {PersonParser, FamilyParser} = require('./lib/parser');
const sourceStore = require('./lib/source-store');
const inFile = __dirname + '/person.doc';

main();

async function main() {
    printHeader();
    const familyData = await getFamilyData();
    // Sex is missing from the person pages, so we have to get it from family
    const sexById = await getSexById(familyData);
    await printPersonRecords(sexById);
    await printFamilyRecords(familyData);
    await printSourceRecords();
    printTrailer();
}

async function printPersonRecords(sexById) {
    let count = 0;
    await eachLine(inFile, {separator: '\f', buffer: 4096}, function (page, last) {
        const parser = new PersonParser(page);
        const properties = parser.getProperties();
        const personId = parser.getPersonId();
        if (sexById[personId]) {
            properties['SEX'] = sexById[personId];
        }
        printPersonRecord(properties);
        count++;
        return !last;
    });
    console.warn(`${count} person records written`);
}

function printHeader() {
    const submitterPointer = '@KCIVEY@';
    printRecord([
        {
            tag: 'HEAD',
            tree: [
                {
                    tag: 'CHAR',
                    data: 'ASCII',
                },
                {
                    tag: 'SOUR',
                    data: '{FamilyEdge}',
                    tree: [
                        {
                            tag: 'NAME',
                            data: 'The Family Edge Plus',
                        },
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
                            data: '5.5.1',
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
                {
                    tag: 'SUBM',
                    data: submitterPointer,
                },
            ],
        },
        {
            pointer: submitterPointer,
            tag: 'SUBM',
            tree: [
                {
                    tag: 'NAME',
                    data: 'Keith Calvert Ivey',
                },
            ],
        },
    ]);
}

function printPersonRecord(properties) {
    const data = {tree: []};
    const parents = [];
    const sources = properties['SOURCES'];
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
                if (sources['Name']) {
                    data.tree.push(sourceStore.getCitation(sources['Name']));
                }
                personId = id;
                break;
            }
            case 'SEX':
                // Insert as second, after name
                data.tree.splice(1, 0, {tag: 'SEX', data: value});
                break;
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
                    const type = {BORN: 'BPlace', DIED: 'DPlace'}[key];
                    const placeTree = [];
                    if (type && sources[type]) {
                        placeTree.push(sourceStore.getCitation(sources[type]));
                    }
                    tree.push({tag: 'PLAC', data: place, tree: placeTree});
                }
                const type = {BORN: 'Birth', DIED: 'Death'}[key];
                if (type && sources[type]) {
                    tree.push(sourceStore.getCitation(sources[type]));
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
                        data: value,
                    }
                );
                break;
            case 'NOTE':
            case 'HISTORY NOTES':
                if (value) {
                    data.tree.push({tag: 'NOTE', data: value});
                }
                break;
            case 'FATHER':
            case 'MOTHER': {
                const {id} = parseName(value);
                if (id) {
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
            const citation = sourceStore.getCitation(sources[type]);
            citation.tree.push({tag: 'NOTE', data: type});
            data.tree.push(citation);
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
    const place = m[3] && m[3].replace(/,? ([A-Z]{2})$/, ', $1');
    // GEDCOM wants uppercase month, and requires 2 digits after slash in dual years
    let date = m[2] && m[2].toUpperCase()
        .replace(/(\d\d)\/\d$/, (m, m1) => m1 + '/' + (+m1 + 101).toString().substr(1, 2));
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

function printSourceRecords() {
    const data = sourceStore.getRecords();
    process.stdout.write(generateGedcom(fixData(data)) + '\n');
}

async function getFamilyData() {
    const inFile = __dirname + '/family.doc';
    const familyData = {};
    let count = 0;
    await eachLine(inFile, {separator: '\f', buffer: 4096}, function (page, last) {
        const parser = new FamilyParser(page);
        const properties = parser.getProperties();
        const familyId = parser.getFamilyId();
        if (familyData[familyId]) {
            // This is a second (or later) page. Combine the children with earlier ones
            Object.assign(familyData[familyId]['CHILDREN'], properties['CHILDREN']);
        }
        else {
            familyData[familyId] = properties;
        }
        count++;
        return !last;
    });
    console.warn(`${Object.keys(familyData).length} family records read (${count} pages)`);
    return familyData;
}

function getSexById(familyData) {
    const sexById = {};
    for (const family of Object.values(familyData)) {
        Object.assign(sexById, family['CHILDREN']);

    }
    return sexById;
}

function printFamilyRecords(familyData) {
    for (const [familyId, properties] of Object.entries(familyData)) {
        const tree = [];
        for (const key of ['HUSBAND', 'WIFE']) {
            const id = properties[key];
            if (id) {
                const tag = key.substr(0, 4);
                const data = '@P' + id + '@';
                tree.push({tag, data});
            }
        }
        for (const childId of Object.keys(properties['CHILDREN'])) {
            tree.push({
                tag: 'CHIL',
                data: '@P' + childId + '@',
            });
        }
        printRecord({
            pointer: '@F' + familyId + '@',
            tag: 'FAM',
            tree,
        });
    }
    console.warn(`${Object.keys(familyData).length} family records written`);
}

function printTrailer() {
    printRecord({tag: 'TRLR'});
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
        const m = !['NOTE', 'CONC'].includes(newRecord.tag) && newRecord.data.match(/;? \[NOTE: ([^\]]+)]$/);
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
