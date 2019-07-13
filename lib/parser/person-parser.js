const BaseParser = require('./base-parser');

class PersonParser extends BaseParser {

    getProperties() {
        if (!this.properties) {
            this.properties = Object.assign(
                this.getSources(),
                this.getHistoryNotes(),
                this.getMainProperties(),
            );
            if (!this.properties['FULL NAME']) {
                throw new Error('Full name is missing from page');
            }
            this.properties['ID'] = this.extractId(this.getProperty('FULL NAME'));
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
                const [, key, value] = m;
                if (!sources[key]) {
                    sources[key] = [];
                }
                sources[key].push(value);
                pos = pattern.lastIndex;
            }
            if (pos !== text.length) {
                throw new Error(`Unexpected format in sources "${text.substr(pos)}"`);
            }
        }
        return {'SOURCES': sources};
    }

    getHistoryNotes() {
        const m = this.unparsed.match(/\n-- HISTORY NOTES -+\n(.+)$/s);
        let notes;
        if (m) {
            notes = m[1].trim();
            this.chopUnparsedEnd(m[0].length);
        }
        return notes ? {'HISTORY NOTES': notes} : {};
    }

    getMainProperties() {
        const properties = {};
        let m;
        while ((m = this.unparsed.match(/^ *([A-Z '\/]+): (.*(?:\n {10,}.+)*)\n/))) {
            this.chopUnparsedStart(m[0].length);
            const key = m[1];
            let value = m[2].trim();
            if (this.isEvent(key)) {
                const {date, date2, extra: place} = this.extractDate(value);
                value = {date, date2, place: this.fixPlace(place)};
            }
            else if (key === 'PARENTS') {
                value = value.trim()
                    .replace(/\s+/g, ' ')
                    .replace(/^Also listed as parents are: /, '')
                    .replace(/[;.]+$/, '')
                    .split('; ');
            }
            properties[key] = value;
        }
        this.checkAllParsed();
        return properties;
    }

    getPersonId() {
        return this.getProperty('ID');
    }

    getParentIds() {
        return ['FATHER', 'MOTHER']
            .map(key => this.extractId(this.getProperty(key)))
            .filter(id => !!id);
    }

    // The family with MOTHER and FATHER
    getChildFamilyId() {
        return this.makeFamilyId(this.getParentIds());
    }

    getSpouseIds() {
        return this.extractIds(this.getProperty('SPOUSES'));
    }

    isEvent(key) {
        return [
            'BORN',
            'BURIED',
            'CHRISTENED',
            'DIED',
            'LOCATION',
            'WILL',
            'WILL/ESTATE',
        ].includes(key);
    }

}

module.exports = PersonParser;
