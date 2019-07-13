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

function extractDate(text) {
    const m = text.trim()
        .replace(/\s+/g, ' ')
        .match(dateRegExp);
    if (!m) {
        throw new Error(`Unexpected date format at start of "${text}"`);
    }
    const [, date, extra] = m;
    return {date, extra};
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

}

Object.assign(
    BaseParser,
    {
        extractDate,
        extractId,
        extractIds,
    }
);

module.exports = BaseParser;
