const BaseParser = require('./base-parser');
const log = require('../logger');

class FamilyParser extends BaseParser {

    getProperties() {
        if (!this.properties) {
            this.properties = {};
            this.getParents();
            this.properties['ID'] = FamilyParser.makeFamilyId(this.getParentIds());
            Object.assign(this.properties, this.getChildren());
        }
        return this.properties;
    }

    getParents() {
        const block = this.getParentBlock();
        let parentFound = false;
        for (const key of ['HUSBAND', 'WIFE', 'SPOUSE']) {
            const pattern = new RegExp(`^\\s*${key}: (.*)$`, 'm');
            const m = block.match(pattern);
            if (m) {
                const id = this.extractId(m[1]);
                if (id) {
                    this.setProperty(key, id);
                    parentFound = true;
                }
            }
        }
        if (!parentFound) {
            throw new Error(`No parents found: "${block}"`);
        }
        if (this.getProperty('SPOUSE')) {
            throw new Error(`SPOUSE used for known parent: "${block}"`);
        }
        this.setProperty('MARR', this.extractMarriageData(block));
    }

    extractMarriageData(block) {
        const records = [];
        let m = block.match(/^\s*MARR: (.*)$/m);
        if (m) {
            const {date, date2, extra: place} = this.extractDate(m[1]);
            if (date2) {
                throw new Error(`Unexpected second date in "${m[0]}"`);
            }
            records.push({type: 'Married', date, place: this.fixPlace(place)});
        }
        m = block.match(/^ *ADD\. SP: (.*(?:\n {8,}.+)*)$/m);
        if (m) {
            const parentIds = this.getParentIds();
            const events = m[1].replace(/\s+/g, ' ').trim()
                .replace(/;$/, '')
                .split('; ');
            for (const event of events) {
                m = event.match(/^(Married|Divorced) (.+)$/);
                if (!m) {
                    throw new Error(`Unexpected format in ADD. SP: ${event}`);
                }
                const [, type, rest] = m;
                const {date, date2, extra: name} = this.extractDate(rest);
                if (date2) {
                    throw new Error(`Unexpected second date in "${rest}"`);
                }
                const id = this.extractId(name);
                if (parentIds.includes(id)) {
                    records.push({type, date});
                }
            }
        }
        return records;
    }

    getParentBlock() {
        const m = this.unparsed.match(/^(?: *(?:HUSBAND|WIFE|SPOUSE): (?:.*\n)+?){2}={30,}\n/);
        if (!m) {
            throw new Error(`No parent block found: "${this.unparsed}"`);
        }
        const block = m[0];
        this.chopUnparsedStart(block.length);
        return block;
    }

    getChildren() {
        const children = {};
        let m;
        while ((m = this.unparsed.match(/^.+?\n[=-]{30,}\n/s))) {
            const block = m[0];
            this.chopUnparsedStart(block.length);
            m = block.match(/^[ \d]\d ([|?]) NAME: (?:.+\(#(\d+)\))?\n ([FM ]) /);
            if (!m) {
                throw new Error(`Unexpected child format: "${block}"`);
            }
            const [, divider, personId, sex] = m;
            if (!personId) { // a bug adds extra empty child rows at the top sometimes
                log.warn(`Empty child in family ${this.getFamilyId()}`);
                continue;
            }
            if (sex !== ' ') {
                children[personId] = sex;
            }
            const uncertain = divider === '?'; // @todo do something with this
            if (uncertain) {
                log.warn(`Uncertain child ${personId} in family ${this.getFamilyId()}`);
            }
        }
        this.unparsed = this.unparsed.replace(/^\s*/, '');
        this.checkAllParsed();
        return {CHILDREN: children};
    }

    getParentIds() {
        return ['HUSBAND', 'WIFE', 'SPOUSE'].map(key => this.getProperty(key))
            .filter(value => !!value);
    }

    getFamilyId() {
        return this.getProperty('ID');
    }

}

FamilyParser.makeFamilyId = function (ids) {
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
};

module.exports = FamilyParser;
