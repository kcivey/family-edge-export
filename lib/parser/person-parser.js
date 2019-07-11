const BaseParser = require('./base-parser');

class PersonParser extends BaseParser {

    getPersonData() {
        this.unparsed = this.unparsed
            .replace(/^.+\n=+\n/, '') // remove header
            .replace(/\nFrom: .+$/s, '\n'); // remove footer
        const record = {
            'SOURCES': this.getSources(),
            'HISTORY NOTES': this.getHistoryNotes(),
        };
        if (!record['HISTORY NOTES']) {
            delete record['HISTORY NOTES'];
        }
        return Object.assign(record, this.getProperties());
    }

    getSources() {
        const sources = {};
        let m = this.unparsed.match(/\n-- SOURCES -+\n(.+)$/s);
        if (m) {
            const text = m[1];
            this.chopUnparsedEnd(m[0].length);
            const pattern = /([^.]+)\.{2,}(.+)\n/y;
            let pos = 0;
            while ((m = pattern.exec(text))) {
                sources[m[1]] = m[2].trim();
                pos = pattern.lastIndex;
            }
            if (pos !== text.length) {
                throw new Error(`Unexpected format in sources "${text.substr(pos)}"`);
            }
        }
        return sources;
    }

    getHistoryNotes() {
        const page = this.unparsed;
        const m = page.match(/\n-- HISTORY NOTES -+\n(.+)$/s);
        let notes = '';
        if (m) {
            notes = m[1].trim();
            this.chopUnparsedEnd(m[0].length);
        }
        return notes;
    }

    getProperties() {
        const record = {};
        let m;
        while ((m = this.unparsed.match(/^ *([A-Z '\/]+): (.*(?:\n {10,}.+)*)\n/))) {
            record[m[1]] = m[2].trim();
            this.chopUnparsedStart(m[0].length);
        }
        if (this.unparsed) {
            throw new Error(`Unexpected format at end of page "${this.unparsed}"`);
        }
        return record;
    }

}

module.exports = PersonParser;
