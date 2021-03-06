#!/usr/bin/env node

const util = require('util');
const argv = require('yargs')
    .options({
        ancestry: {
            type: 'ancestry',
            describe: 'write nonstandard GEDCOM format for Ancestry.com',
        },
    })
    .strict(true)
    .argv;
const eachLine = util.promisify(require('line-reader').eachLine);
const {PersonParser, FamilyParser} = require('./lib/parser');
const gedcomWriter = require('./lib/gedcom-writer');
const {makeFamilyPointer, makePersonPointer} = gedcomWriter;
const sourceStore = require('./lib/source-store');
const log = require('./lib/logger');
const inFile = __dirname + '/person.doc';

if (argv.ancestry) {
    gedcomWriter.setAncestryFormat(true);
}

main().catch(log.error);

async function main() {
    printHeader();
    const familyData = await getFamilyData();
    await printPersonRecords(familyData);
    await printFamilyRecords(familyData);
    await printSourceRecords();
    printTrailer();
}

async function printPersonRecords(familyData) {
    // Sex is missing from the person pages, so we have to get it from family
    const sexById = await getSexById(familyData);
    let count = 0;
    await eachLine(inFile, {separator: '\f', buffer: 4096}, function (page, last) {
        const parser = new PersonParser(page);
        const properties = parser.getProperties();
        const personId = parser.getPersonId();
        const childFamilyId = parser.getChildFamilyId();
        properties['UNCERTAIN PARENTS'] = childFamilyId && familyData[childFamilyId]['CHILDREN'][personId].uncertain;
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

function getTag(key) {
    // Space means OK to skip (sometimes handled elsewhere)
    return {
        'BORN': 'BIRT',
        'BURIED': 'BURI',
        'CHRISTENED': 'CHR',
        'DIED': 'DEAT',
        'FULL NAME': 'NAME',
        'HISTORY NOTES': 'NOTE',
        'LOCATION': 'RESI',
        'NOTE': 'NOTE',
        'OCCUPATION': 'OCCU',
        'SEX': 'SEX',
        'SPOUSES': 'FAMS',
        'WILL': 'WILL',
        'WILL/ESTATE': 'PROB',
        'CHILDREN': '',
        'FULL SIBL\'G': '',
        'ID': '',
        'NICKNAME': '',
        'SOURCES': '',
        'TOMBSTONE': '',
        'UNCERTAIN PARENTS': '',
    }[key];
}

function printPersonRecord(properties) {
    const data = {tree: []};
    const parentSets = [{parents: []}];
    const sources = properties['SOURCES'];
    const personId = properties['ID'];
    for (const [key, value] of Object.entries(properties)) {
        const tag = getTag(key);
        switch (key) {
            case 'FULL NAME': {
                let {name} = parseName(value);
                if (properties['NICKNAME']) {
                    name = name.replace('/', '"' + properties['NICKNAME'] + '" /');
                }
                data.pointer = makePersonPointer(personId);
                data.tag = 'INDI';
                data.tree.push({
                    tag,
                    data: name,
                    tree: sourceStore.getCitations(sources['Name']),
                });
                break;
            }
            case 'SEX':
                // Insert as second, after name
                data.tree.splice(1, 0, {tag, data: value});
                break;
            case 'BORN':
            case 'DIED':
            case 'BURIED':
            case 'LOCATION':
            case 'CHRISTENED':
            case 'WILL':
            case 'WILL/ESTATE': {
                const eventTree = getEventTree(tag, value, sources);
                if (key === 'BURIED' && properties['TOMBSTONE']) {
                    eventTree.push({tag: 'NOTE', data: 'Gravestone: ' + properties['TOMBSTONE'].replace(/;?\.?$/, '')});
                }
                data.tree.push({tag, tree: eventTree});
                const {date2, place} = {value};
                if (date2) {
                    if (key === 'WILL') {
                        const tag = 'PROB';
                        const tree = getEventTree(tag, {date: date2, place});
                        data.tree.push({tag, tree});
                    }
                    else {
                        throw new Error(`Unexpected second date in ${key} for person ${personId}`);
                    }
                }
                break;
            }
            case 'OCCUPATION':
            case 'NOTE':
            case 'HISTORY NOTES':
                if (value) {
                    data.tree.push({tag, data: value});
                }
                break;
            case 'FATHER':
            case 'MOTHER': {
                const id = PersonParser.extractId(value);
                if (id) {
                    parentSets[0].parents.push(id);
                }
                break;
            }
            case 'PARENTS': {
                for (let text of value) {
                    const m = text.match(/^(.+) \[NOTE: (.+)]$/);
                    let note = '';
                    if (m) {
                        note = m[2];
                        text = m[1];
                    }
                    const parents = PersonParser.extractIds(text);
                    if (parents.length) {
                        parentSets.push({parents, note});
                    }
                    else {
                        throw new Error(`Unexpected text in PARENTS for ${personId}: "${text}"`);
                    }
                }
                break;
            }
            case 'SPOUSES': {
                const spouseIds = PersonParser.extractIds(value);
                for (const spouseId of spouseIds) {
                    data.tree.push({tag, data: makeFamilyPointer([personId, spouseId])});
                }
                break;
            }
            default:
                if (tag !== '') { // OK to skip
                    log.warn(`Skipping ${key}`);
                }
        }
    }
    data.tree.push(...getChildFamilyTree(parentSets, properties['UNCERTAIN PARENTS']));
    data.tree.push(...getCitationsForRecord(sources));
    printGedcom(data);
}

function getChildFamilyTree(parentSets, uncertain) {
    const tree = [];
    for (const set of parentSets) {
        const pointer = makeFamilyPointer(set.parents);
        if (pointer) {
            const subtree = [];
            if (uncertain) {
                subtree.push({tag: 'STAT', data: 'challenged'});
                uncertain = false; // it applies only to the primary parents
            }
            let note = set.note || '';
            const m = note.match(/(adopted|foster)(.*)/i);
            if (m) {
                const parentType = m[1].toLowerCase();
                const rest = m[2];
                subtree.push({tag: 'PEDI', data: parentType});
                if (note.toLowerCase() === parentType) {
                    note = ''; // no need for note if it just says "Adopted"
                }
                if (parentType === 'adopted') {
                    const adoptedTree = [{tag: 'FAMC', data: pointer}];
                    const {date} = PersonParser.extractDate(rest);
                    if (date) {
                        adoptedTree.push({tag: 'DATE', data: gedcomWriter.normalizeDate(date)});
                        if (note.length <= 11 + date.length) { // just says "Adopted" and date
                            note = '';
                        }
                    }
                    if (note) {
                        adoptedTree.push({tag: 'NOTE', data: note});
                    }
                    tree.push({tag: 'ADOP', tree: adoptedTree});
                }
            }
            if (note) {
                subtree.push({tag: 'NOTE', data: set.note});
            }
            tree.push({tag: 'FAMC', data: pointer, tree: subtree});
        }
    }
    return tree;
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
        surname => '/' + gedcomWriter.titleCase(surname) + '/');
    name = name.replace(/ \/\?{3}\/$/, '') // missing last names
        .replace(/^\?{3} /, ''); // missing first names
    if (suffix) {
        name += ' ' + suffix;
    }
    id = +id;
    return {name, id};
}

function printGedcom(text) {
    if (typeof text !== 'string') {
        text = gedcomWriter.generateGedcom(text);
    }
    return process.stdout.write(text);
}

function getEventTree(tag, value, sources = {}) {
    const {date, place} = value;
    const eventTree = [];
    if (date) {
        eventTree.push({tag: 'DATE', data: gedcomWriter.normalizeDate(date)});
    }
    if (place) {
        eventTree.push({tag: 'PLAC', data: gedcomWriter.normalizePlace(place)});
    }
    const sourceTypes = tag === 'BIRT' ? ['Birth', 'BPlace'] : tag === 'DEAT' ? ['Death', 'DPlace'] : [];
    const eventSources = [];
    for (const type of sourceTypes) {
        for (const source of sources[type] || []) {
            if (!eventSources.includes(source)) {
                eventSources.push(source);
            }
        }
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
        for (const [childId, child] of Object.entries(family['CHILDREN'])) {
            if (child.sex) {
                sexById[childId] = child.sex;
            }
        }
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
            // Family Edge has no sources for marriages
            const eventTree = getEventTree(tag, {date, place});
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
