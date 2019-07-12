#!/usr/bin/env node

const util = require('util');
const moment = require('moment');
const generateGedcom = require('generate-gedcom');
const eachLine = util.promisify(require('line-reader').eachLine);
const {PersonParser, FamilyParser, makeFamilyId} = require('./lib/parser');
const sourceStore = require('./lib/source-store');
const log = require('./lib/logger');
const inFile = __dirname + '/person.doc';

main().catch(err => log.error(err));

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
    log.success(`${count} person records written`);
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
    const personId = properties['ID'];
    if (properties['TOMBSTONE'] && !properties['BURIED']) {
        properties['BURIED'] = '';
    }
    for (const [key, value] of Object.entries(properties)) {
        switch (key) {
            case 'FULL NAME': {
                const {name} = parseName(value);
                data.pointer = personPointer(personId);
                data.tag = 'INDI';
                data.tree.push(
                    {tag: 'NAME', data: name},
                    ...sourceStore.getCitations(sources['Name']),
                );
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
                const eventTree = getEventTree(key, value, sources);
                if (key === 'BURIED' && properties['TOMBSTONE']) {
                    eventTree.push({tag: 'NOTE', data: 'Gravestone: ' + properties['TOMBSTONE'].replace(/;?\.?$/, '')});
                }
                const tag = {
                    BORN: 'BIRT',
                    DIED: 'DEAT',
                    BURIED: 'BURI',
                    LOCATION: 'RESI',
                    CHRISTENED: 'CHR',
                }[key];
                data.tree.push({tag, tree: eventTree});
                break;
            }
            case 'OCCUPATION':
                data.tree.push({tag: 'OCCU', data: value});
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
            case 'CHILDREN':
            case 'FULL SIBL\'G':
            case 'ID':
            case 'SOURCES':
            case 'TOMBSTONE':
                // skip
                break;
            default:
                log.warn(`Skipping ${key}`);
        }
    }
    if (parents.length) {
        data.tree.push({tag: 'FAMC', data: familyPointer(parents)});
    }
    data.tree.push(...getCitationsForRecord(sources));
    printRecord(data);
}

function getCitationsForRecord(sources) {
    const sourcesByTitle = [];
    for (const type of ['Father', 'Mother', 'Other']) {
        for (const title of sources[type] || []) {
            if (!sourcesByTitle[title]) {
                sourcesByTitle[title] = [];
            }
            sourcesByTitle[title].push(type);
        }
    }
    const citations = [];
    for (const [title, types] of Object.entries(sourcesByTitle)) {
        let note = types.includes('Other') ? '' : types.join(', ');
        if (note === 'Father, Mother') {
            note = 'Parents';
        }
        citations.push(sourceStore.getCitation(title, note));
    }
    return citations;
}

function parseName(s) {
    if (!s) {
        return {};
    }
    const m = s.match(/^(.+?)(?: ([JS]r|I+|IV|VI*))?\.? \(#(\d+)\)$/);
    if (!m) {
        throw new Error(`Unexpected person format "${s}"`);
    }
    let [, name, suffix, id] = m;
    name = name.replace(/\b[A-Z'-]{2,}(?:\b \b[A-Z'-]{2,})*$|\?{3}$/,
        surname => '/' + titleCase(surname) + '/');
    name = name.replace(/ \/\/{3}\/$/, '') // missing last names
        .replace(/^\?{3} /, ''); // missing first names
    if (suffix) {
        name += ' ' + suffix;
    }
    id = +id;
    return {name, id};
}

function titleCase(s) {
    return s.replace(/[^\W_]+/g, initialCap)
        .replace(/^(Mc)(\w+)/, (m, m1, m2) => m1 + initialCap(m2));
}

function initialCap(s) {
    return s.substr(0, 1).toUpperCase() + s.substr(1).toLowerCase();
}

function personPointer(id) {
    return `@P${id}@`;
}

function familyPointer(ids) {
    const familyId = Array.isArray(ids) ? makeFamilyId(ids) : ids;
    return familyId && `@F${familyId}@`;
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
    let date = normalizeDate(m[2]);
    if (date && prefix) {
        date = prefix + ' ' + date;
    }
    const place = m[3] && m[3].replace(/,? ([A-Z]{2})$/, ', $1');
    return {date, place};
}

function normalizeDate(date) {
    if (!date) {
        return null;
    }
    // GEDCOM wants uppercase month, and requires 2 digits after slash in dual years
    return date.toUpperCase()
        .replace(/(\d\d)\/\d$/, (m, m1) => m1 + '/' + (+m1 + 101).toString().substr(1, 2));
}

function getEventTree(key, value, sources) {
    const {date, place} = parseDatePlace(value);
    const [type, placeType] = key === 'BORN' ? ['Birth', 'BPlace'] : key === 'DIED' ? ['Death', 'DPlace'] : [];
    const eventTree = [];
    if (date) {
        eventTree.push({tag: 'DATE', data: date});
    }
    const eventSources = sources[type] || []; // attach to whole event since DATE can't have SOUR
    if (place) {
        const placeSources = (sources[placeType] || [])
            .filter(source => !eventSources.includes(source)); // exclude any already on higher level
        eventTree.push({tag: 'PLAC', data: place, tree: sourceStore.getCitations(placeSources)});
    }
    eventTree.push(...sourceStore.getCitations(eventSources));
    return eventTree;
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
    log.success(`${Object.keys(familyData).length} family records read (${count} pages)`);
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
                const data = personPointer(id);
                tree.push({tag, data});
            }
        }
        for (const childId of Object.keys(properties['CHILDREN'])) {
            tree.push({
                tag: 'CHIL',
                data: personPointer(childId),
            });
        }
        printRecord({
            pointer: familyPointer(familyId),
            tag: 'FAM',
            tree,
        });
    }
    log.success(`${Object.keys(familyData).length} family records written`);
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
