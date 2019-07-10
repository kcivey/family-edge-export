class PersonParser {

    constructor(page) {
        this.page = page;
        this.unparsed = page;
    }

    getPersonData() {
        this.unparsed = this.page.replace(/\r\n/g, '\n') // regularize line endings
            .replace(/^.+\n=+\n/, '') // remove header
            .replace(/\nFrom: .+$/s, '\n'); // remove footer
        return Object.assign(
            {
                'SOURCES': this.getSources(),
                'HISTORY NOTES': this.getHistoryNotes(),
            },
            this.getProperties()
        );
    }

    getSources() {
        const page = this.unparsed;
        const sources = {};
        let m = page.match(/\n-- SOURCES -+\n(.+)$/s);
        if (m) {
            const text = m[1];
            this.unparsed = page.substr(0, page.length - m[0].length);
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
        let notes = null;
        if (m) {
            notes = m[1].trim();
            this.unparsed = page.substr(0, page.length - m[0].length);
        }
        return notes;
    }

    getProperties() {
        const page = this.unparsed;
        const record = {};
        const pattern = / *([^:]+): (.*(?:\n {10,}.+)*)\n/y;
        let pos = 0;
        let m;
        while ((m = pattern.exec(page))) {
            record[m[1]] = m[2].trim();
            pos = pattern.lastIndex;
        }
        if (pos !== page.length) {
            throw new Error(`Unexpected format at end of page "${page.substr(pos)}"`);
        }
        return record;
    }

}

module.exports = PersonParser;
