const BaseParser = require('./base-parser');
const log = require('../logger');

class FamilyParser extends BaseParser {

    getProperties() {
        if (!this.properties) {
            this.properties = Object.assign(
                this.getParents(),
                this.getChildren(),
            );
        }
        return this.properties;
    }

    getParents() {
        const block = this.getParentBlock();
        const properties = {};
        for (const key of ['HUSBAND', 'WIFE', 'SPOUSE']) {
            const pattern = new RegExp(`^\\s*${key}: (.*)$`, 'm');
            const m = block.match(pattern);
            if (m) {
                const id = this.extractId(m[1]);
                if (id) {
                    properties[key] = id;
                }
            }
        }
        if (!Object.keys(properties).length) {
            throw new Error(`No parents found: "${block}"`);
        }
        if (properties['SPOUSE']) {
            throw new Error(`SPOUSE used for known parent: "${block}"`);
        }
        const m = block.match(/^\s*(MARR): (.*)$/m);
        if (m) {
            properties[m[1]] = m[2];
        }
        return properties;
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
                log.warn('Empty child');
                continue;
            }
            if (sex !== ' ') {
                children[personId] = sex;
            }
            const uncertain = divider === '?'; // @todo do something with this
            if (uncertain) {
                log.warn(`Uncertain child ${personId}`);
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
        return FamilyParser.makeFamilyId(this.getParentIds());
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
