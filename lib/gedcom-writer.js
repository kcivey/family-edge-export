const fs = require('fs');
const baseGenerateGedcom = require('generate-gedcom');
const moment = require('moment');
const yaml = require('js-yaml');
const {makeFamilyId, eventTagsToKeys} = require('./parser');
const abbrToState = require('./us-states');
const submitterYamlFile = __dirname + '/submitter.yaml';
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
    let prefix = {
        'after': 'AFT',
        'before': 'BEF',
        'circa': 'ABT',
        'roughly': 'EST',
        '(?)': 'ABT', // I wish there were something better for this
    }[m[1] || m[3]];
    // GEDCOM requires 2 digits after the slash in dual years
    let date = m[2]
        .replace(/(\d\d)\/\d$/, (m, m1) => m1 + '/' + (+m1 + 101).toString().substr(1, 2));
    if (ancestryFormat) {
        date = titleCase(date); // Ancestry prefers mixed case for month
        if (prefix) {
            prefix = prefix.toLowerCase();
        }
    }
    else {
        date = date.toUpperCase(); // GEDCOM wants all caps for month
    }
    if (prefix) {
        date = `${prefix} ${date}`;
    }
    return date;
}

function normalizePlace(text) {
    const place = text.trim()
        .replace(/,? ([A-Z]{2})$/, ', $1'); // make sure there's a comma before the state
    const parts = place.split(/\s*,\s*/);
    const lastPart = parts[parts.length - 1];
    if (abbrToState[lastPart]) {
        parts[parts.length - 1] = abbrToState[lastPart];
        parts.push('USA');
        if (parts.length > 3) {
            parts[parts.length - 3] = parts[parts.length - 3].replace(/ Co$/, '');
        }
        else if (parts.length === 3) {
            parts[parts.length - 3] = parts[parts.length - 3].replace(/ Co$/, ' County');
        }
    }
    return parts.join(', ');
}

function titleCase(s) {
    return s.replace(/[^\W_]+/g, initialCap)
        .replace(/^(Mc)(\w+)/, (m, m1, m2) => m1 + initialCap(m2));
}

function initialCap(s) {
    return s.substr(0, 1).toUpperCase() + s.substr(1).toLowerCase();
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
        let note = '';
        const m = !['NOTE', 'CONC'].includes(newRecord.tag) && newRecord.data.match(/;? \[NOTE: ([^\]]+)]$/);
        if (m) {
            note = m[1];
            newRecord.data = newRecord.data.substr(0, newRecord.data.length - m[0].length);
        }
        if (newRecord.tag !== 'PLAC' && (newRecord.data.length > allowedLength || newRecord.data.includes('\n'))) {
            const re = new RegExp(`.{0,${allowedLength - 1}}\\S`, 'g');
            let firstLine = true;
            const lines = newRecord.data.split('\n');
            for (const line of lines) {
                let firstPart = true;
                const parts = line.match(re);
                for (const part of parts) {
                    if (firstLine && firstPart) {
                        newRecord.data = part;
                    }
                    else {
                        newRecord.tree.push({tag: firstPart ? 'CONT' : 'CONC', data: part});
                    }
                    firstPart = false;
                }
                firstLine = false;
            }
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

function getHeader() {
    const submitter = yaml.safeLoad(fs.readFileSync(submitterYamlFile));
    const pointer = this.makePointer(submitter.id);
    const headRecord = {
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
    };
    const submitterTree = [{tag: 'NAME', data: submitter.name}];
    const keyMap = {
        address: 'ADDR',
        phone: 'PHONE',
        email: 'EMAIL',
        fax: 'FAX',
        web: 'WWW',
    };
    for (const [key, tag] of Object.entries(keyMap)) {
        if (submitter[key]) {
            submitterTree.push({tag, data: submitter[key]});
        }
    }
    return this.generateGedcom([
        headRecord,
        {
            pointer,
            tag: 'SUBM',
            tree: submitterTree,
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
    titleCase,
};

