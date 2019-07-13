#!/usr/bin/env node

const util = require('util');
const eachLine = util.promisify(require('line-reader').eachLine);
const {PersonParser, FamilyParser} = require('./lib/parser');
const gedcomWriter = require('./lib/gedcom-writer');
const {makeFamilyPointer, makePersonPointer} = gedcomWriter;
const sourceStore = require('./lib/source-store');
const log = require('./lib/logger');
const inFile = __dirname + '/person.doc';

main().catch(log.error);

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
    printGedcom(gedcomWriter.getHeader({id: 'KCIVEY', name: 'Keith Calvert Ivey'}));
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
                data.pointer = makePersonPointer(personId);
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
                const spouseIds = PersonParser.extractIds(value);
                for (const spouseId of spouseIds) {
                    data.tree.push({tag: 'FAMS', data: makeFamilyPointer([personId, spouseId])});
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
        data.tree.push({tag: 'FAMC', data: makeFamilyPointer(parents)});
    }
    data.tree.push(...getCitationsForRecord(sources));
    printGedcom(data);
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
    name = name.replace(/ \/\?{3}\/$/, '') // missing last names
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

function printGedcom(text) {
    if (typeof text !== 'string') {
        text = gedcomWriter.generateGedcom(text);
    }
    return process.stdout.write(text);
}

function getEventTree(key, value, sources) {
    const {date, place} = value;
    const [type, placeType] = key === 'BORN' ? ['Birth', 'BPlace'] : key === 'DIED' ? ['Death', 'DPlace'] : [];
    const eventTree = [];
    if (date) {
        eventTree.push({tag: 'DATE', data: gedcomWriter.normalizeDate(date)});
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

function printSourceRecords() {
    printGedcom(sourceStore.getRecords());
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
            // This is a second (or later) page, combine the children with earlier ones
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
        if (family['HUSBAND']) {
            sexById[family['HUSBAND']] = 'M';
        }
        if (family['WIFE']) {
            sexById[family['WIFE']] = 'F';
        }
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
                const data = makePersonPointer(id);
                tree.push({tag, data});
            }
        }
        for (const event of properties['MARR']) {
            const {type, date, place} = event;
            const tag = {Married: 'MARR', Divorced: 'DIV'}[type];
            const eventTree = [];
            if (date) {
                eventTree.push({tag: 'DATE', data: gedcomWriter.normalizeDate(date)});
            }
            if (place) {
                eventTree.push({tag: 'PLAC', data: place});
            }
            // Family Edge has no sources for marriages
            tree.push({tag, tree: eventTree});
        }
        for (const childId of Object.keys(properties['CHILDREN'])) {
            tree.push({
                tag: 'CHIL',
                data: makePersonPointer(childId),
            });
        }
        printGedcom({
            pointer: makeFamilyPointer(familyId),
            tag: 'FAM',
            tree,
        });
    }
    log.success(`${Object.keys(familyData).length} family records written`);
}

function printTrailer() {
    printGedcom(gedcomWriter.getTrailer());
}
