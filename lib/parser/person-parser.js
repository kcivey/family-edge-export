const BaseParser = require('./base-parser');

class PersonParser extends BaseParser {

    getProperties() {
        if (!this.properties) {
            const properties = {
                'SOURCES': this.getSources(),
                'HISTORY NOTES': this.getHistoryNotes(),
            };
            if (!properties['HISTORY NOTES']) {
                delete properties['HISTORY NOTES'];
            }
            this.properties = Object.assign(properties, this.getMainProperties());
            if (!this.properties['FULL NAME']) {
                throw new Error('Full name is missing from page');
            }
        }
        return this.properties;
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
        const m = this.unparsed.match(/\n-- HISTORY NOTES -+\n(.+)$/s);
        let notes;
        if (m) {
            notes = m[1].trim();
            this.chopUnparsedEnd(m[0].length);
        }
        return notes;
    }

    getMainProperties() {
        const properties = {};
        let m;
        while ((m = this.unparsed.match(/^ *([A-Z '\/]+): (.*(?:\n {10,}.+)*)\n/))) {
            properties[m[1]] = m[2].trim();
            this.chopUnparsedStart(m[0].length);
        }
        this.checkAllParsed();
        return properties;
    }

    getPersonId() {
        return this.extractId(this.getProperty('FULL NAME'));
    }

    getParentIds() {
        return ['FATHER', 'MOTHER']
            .map(key => this.extractId(this.getProperty(key)))
            .filter(id => !!id);
    }

    getSpouseIds() {
        return this.extractIds(this.getProperty('SPOUSES'));
    }

}

module.exports = PersonParser;
