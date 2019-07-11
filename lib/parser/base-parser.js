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

    extractId(text) {
        const m = text.match(/\(#(\d+)\)/);
        return m ? +m[1] : undefined;
    }

    extractIds(text) {
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

}

module.exports = BaseParser;
