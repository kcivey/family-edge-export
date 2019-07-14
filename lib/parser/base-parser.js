const dateRegExp = new RegExp(
    [
        /* eslint-disable indent */
        '^',
        '(?:living )?', // redundant, at start of LOCATION
        '(', // beginning of date
            '(?:(?:circa|roughly|before|after) )?',
            '(?:',
                '(?:\\d\\d? )?', // day
                '\\w{3} ', // month
            ')?',
            '\\d{4}', // year
            '(?:\\/\\d\\d?)?', // dual year
            '(?:\\(\\?\\))?', // question mark in parentheses after
        ')?',
        ' ?',
        '(.*?)', // extra
        '[.;]*', // junk at end
        '$',
        /* eslint-enable indent */
    ].join('')
);

const eventTagsToKeys = {
    'BIRT': 'BORN',
    'BURI': 'BURIED',
    'CHR': 'CHRISTENED',
    'DEAT': 'DIED',
    'RESI': 'LOCATION',
    'WILL': 'WILL',
    'PROB': 'WILL/ESTATE',
};

const eventKeys = Object.values(eventTagsToKeys);

function isEvent(key) {
    return eventKeys.includes(key);
}

function extractDate(text) {
    let m = text.trim()
        .replace(/\s+/g, ' ')
        .match(dateRegExp);
    if (!m) {
        throw new Error(`Unexpected date format at start of "${text}"`);
    }
    let [, date, extra] = m;
    // Get second date if it exists (in WILL/EStATE)
    let date2 = undefined;
    if (extra.substr(0, 1) === '(') {
        m = extra.substr(1).match(dateRegExp);
        if (m && m[2].match(/^\)/)) {
            date2 = m[1];
            extra = m[2].replace(/^\) ?/, '');
        }
    }
    return {date, date2, extra};
}

function extractId(text) {
    return extractIds(text)[0];
}

function extractIds(text) {
    const ids = [];
    const pattern = /\(#(\d+)\)/g;
    let m;
    while ((m = pattern.exec(text))) {
        const id = +m[1];
        if (!ids.includes(id)) {
            ids.push(id);
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

class BaseParser {

    constructor(page) {
        this.setPage(page);
    }

    setPage(page) {
        this.page = page;
        this.unparsed = page.replace(/\r\n/g, '\n') // normalize line endings
            .replace(/^.+\n=+\n/, '') // remove header
            .replace(/\nFrom: .+$/s, '\n'); // remove footer
    }

    chopUnparsedEnd(chars) {
        this.unparsed = this.unparsed.substr(0, this.unparsed.length - chars);
    }

    chopUnparsedStart(chars) {
        this.unparsed = this.unparsed.substr(chars);
    }

    checkAllParsed() {
        if (this.unparsed) {
            throw new Error(`Unexpected format at end of page "${this.unparsed}"`);
        }
    }

    getProperty(key) {
        return this.getProperties()[key];
    }

    setProperty(key, value) {
        this.properties[key] = value;
    }

    fixPlace(place) {
        if (place) {
            // Some of the places are missing comma before state
            place = place.replace(/,? ([A-Z]{2})$/, ', $1');
        }
        return place;
    }

    extractId(text) {
        return extractId(text);
    }

    extractIds(text) {
        return extractIds(text);
    }

    extractDate(text) {
        return extractDate(text);
    }

    makeFamilyId(text) {
        return makeFamilyId(text);
    }

    isEvent(key) {
        return isEvent(key);
    }

}

Object.assign(
    BaseParser,
    {
        eventTagsToKeys,
        extractDate,
        extractId,
        extractIds,
        isEvent,
        makeFamilyId,
    }
);

module.exports = BaseParser;
