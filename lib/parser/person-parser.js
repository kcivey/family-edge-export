const BaseParser = require('./base-parser');

class PersonParser extends BaseParser {

    getProperties() {
        if (!this.properties) {
            this.properties = Object.assign(
                this.getSources(),
                this.getHistoryNotes(),
                this.getMainProperties(),
            );
            if (!this.getProperty('FULL NAME')) {
                throw new Error('Full name is missing from page');
            }
            this.setProperty('ID', this.extractId(this.getProperty('FULL NAME')));
        }
        this.handleNickname();
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
            notes = m[1].trim().replace(/\s+/g, ' ');
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
                value = {date, date2, place};
            }
            else {
                value = value.trim()
                    .replace(/\s+/g, ' ');
                if (key === 'PARENTS') {
                    value = value.replace(/^Also listed as parents are: /, '')
                        .replace(/[;.]+$/, '')
                        .split('; ');
                }
            }
            properties[key] = value;
        }
        this.checkAllParsed();
        if (properties['TOMBSTONE'] && !properties['BURIED']) {
            properties['BURIED'] = '';
        }
        return properties;
    }

    handleNickname() {
        // Can't use set/getProperty() here or we'll have infinite loop
        const note = this.properties['NOTE'];
        const m = note && note.match(/^"([^"]{1,20})"$/);
        if (m) {
            const nickname = m[1];
            // If it's not a middle name or first two names
            if (!this.properties['FULL NAME'].includes(`${nickname} `)) {
                this.properties['NICKNAME'] = nickname;
                delete this.properties['NOTE'];
            }
        }
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

}

module.exports = PersonParser;
