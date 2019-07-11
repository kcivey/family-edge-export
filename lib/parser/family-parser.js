const BaseParser = require('./base-parser');

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
        let parentsFound = false;
        for (const key of ['HUSBAND', 'WIFE']) {
            const pattern = new RegExp(`^\\s*(${key}): (.*)$`, 'm');
            const m = block.match(pattern);
            if (!m) {
                throw new Error(`No ${key} line found: "${block}"`);
            }
            const id = this.extractId(m[2]);
            if (id) {
                properties[m[1]] = id;
                parentsFound = true;
            }
        }
        if (!parentsFound) {
            throw new Error(`No parents found: "${block}"`);
        }
        const m = block.match(/^\s*(MARR): (.*)$/m);
        if (m) {
            properties[m[1]] = m[2];
        }
        return properties;
    }

    getParentBlock() {
        const m = this.unparsed.match(/^(?:(?:HUSBAND| *WIFE): (?:.*\n)+?){2}={30,}\n/);
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
            m = block.match(/^[ \d]\d \| NAME: .+\(#(\d+)\)\n ([FM ]) /);
            if (!m) {
                throw new Error(`Unexpected child format: "${block}"`);
            }
            if (m[2] !== ' ') {
                children[m[1]] = m[2];
            }
        }
        this.unparsed = this.unparsed.replace(/^\s*/, '');
        this.checkAllParsed();
        return {CHILDREN: children};
    }

    getFamilyId() {
        let ids = ['HUSBAND', 'WIFE'].map(key => this.getProperty(key))
            .filter(value => !!value);
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

}

module.exports = FamilyParser;
