const baseGenerateGedcom = require('generate-gedcom');
const moment = require('moment');
const {makeFamilyId, eventTagsToKeys} = require('./parser');
const abbrToState = require('./us-states');
let ancestryFormat = false;

const dateRegExp = new RegExp(
    [
        /* eslint-disable indent */
        '^',
        '(?:',
            '(circa|roughly|before|after)', // optional prefix
            ' ',
        ')?',
        '(', // start of actual date
            '(?:',
                '(?:\\d\\d? )?', // optional day
                '\\w{3} ', // month (optional if day is missing)
            ')?',
            '\\d{4}', // year
            '(?:\\/\\d\\d?)?', // dual year
        ')',
        '(\\(\\?\\))?', // question mark in parentheses (optional)
        '$',
        /* eslint-enable indent */
    ].join('')
);

function makePointer(id, prefix = '') {
    return id == null ? null : `@${prefix}${id}@`;
}

function makeFamilyPointer(id) {
    if (Array.isArray(id)) {
        id = makeFamilyId(id);
    }
    return makePointer(id, 'F');
}

function makePersonPointer(id) {
    return makePointer(id, 'P');
}

function generateGedcom(data) {
    return baseGenerateGedcom(fixData(data)) + '\n';
}

function normalizeDate(text) {
    if (!text) {
        return null;
    }
    const m = text.match(dateRegExp);
    if (!m) {
        throw new Error(`Invalid date format "${text}"`);
    }
    const prefix = {
        'after': 'AFT',
        'before': 'BEF',
        'circa': 'ABT',
        'roughly': 'EST',
        '(?)': 'ABT', // I wish there were something better for this
    }[m[1] || m[3]];
    // GEDCOM wants uppercase month, and requires 2 digits after slash in dual years
    let date = m[2].toUpperCase()
        .replace(/(\d\d)\/\d$/, (m, m1) => m1 + '/' + (+m1 + 101).toString().substr(1, 2));
    if (prefix) {
        date = `${prefix} ${date}`;
    }
    return date;
}

function normalizePlace(text) {
    return text.replace(
        /(^|,? )([A-Z]{2})$/,
        function (match, prefix, abbr) {
            const state = abbrToState[abbr];
            if (prefix === ' ') {
                prefix = ', ';
            }
            return state ? `${prefix}${state}, USA` : match;
        }
    );
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
        if (newRecord.tag !== 'PLAC' && newRecord.data.length > allowedLength) {
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
        if (ancestryFormat && isEvent(newRecord.tag) && !newRecord.data) {
            // Ancestry,com uses an invalid GEDCOM format in which what it calls a "description"
            // is put into the data for the event, which is supposed to be empty (or "Y" in some
            // cases), rather than in a NOTE tag.
            let noteIndex = false;
            let note = '';
            for (let i = 0; i < newRecord.tree.length; i++) {
                const item = newRecord.tree[i];
                if (item.tag === 'NOTE') {
                    noteIndex = i;
                    note = item.data.replace(/\s+/g, ' ');
                    break;
                }
            }
            if (noteIndex !== false) {
                newRecord.data = note;
                newRecord.tree.splice(noteIndex, 1); // remove note from tree
            }
        }
        newRecord.tree = fixData(newRecord.tree);
        newData.push(newRecord);
    }
    return newData;
}

function getHeader(submitter) {
    const pointer = this.makePointer(submitter.id);
    return this.generateGedcom([
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
                    data: pointer,
                },
            ],
        },
        {
            pointer,
            tag: 'SUBM',
            tree: [
                {
                    tag: 'NAME',
                    data: submitter.name,
                },
            ],
        },
    ]);
}

function getTrailer() {
    return generateGedcom({tag: 'TRLR'});
}

function isEvent(tag) {
    return eventTagsToKeys.hasOwnProperty(tag);
}

function setAncestryFormat(value) {
    ancestryFormat = !!value;
}

module.exports = {
    fixData,
    generateGedcom,
    getHeader,
    getTrailer,
    isEvent,
    makeFamilyPointer,
    makePersonPointer,
    makePointer,
    normalizeDate,
    normalizePlace,
    setAncestryFormat,
};

