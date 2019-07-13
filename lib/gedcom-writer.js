const baseGenerateGedcom = require('generate-gedcom');
const moment = require('moment');
const {makeFamilyId} = require('./parser');

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
    return `@${prefix}${id}@`;
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

function normalizeDate(dateField) {
    if (!dateField) {
        return null;
    }
    const m = dateField.match(dateRegExp);
    if (!m) {
        throw new Error(`Invalid date format "${dateField}"`);
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

module.exports = {
    fixData,
    generateGedcom,
    getHeader,
    getTrailer,
    makeFamilyPointer,
    makePersonPointer,
    makePointer,
    normalizeDate,
};

