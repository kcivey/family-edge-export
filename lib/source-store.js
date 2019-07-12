class SourceStore {

    constructor() {
        this.sources = {};
    }

    getId(title) {
        if (typeof title !== 'string') {
            throw new Error('Title of source must be a string');
        }
        const sources = this.sources;
        if (!sources[title]) {
            sources[title] = Object.keys(sources).length + 1;
        }
        return sources[title];
    }

    getPointer(title) {
        return '@S' + this.getId(title) + '@';
    }

    getCitation(title, note = '') {
        const tree = [];
        if (note) {
            tree.push({tag: 'NOTE', data: note});
        }
        return {tag: 'SOUR', data: this.getPointer(title), tree};
    }

    getCitations(titles) {
        if (!titles) {
            titles = [];
        }
        return titles.map(title => this.getCitation(title));
    }

    getRecords() {
        const records = [];
        for (const title of Object.keys(this.sources)) {
            records.push({
                pointer: this.getPointer(title),
                tag: 'SOUR',
                tree: [{pointer: '', tag: 'TITL', data: title}],
            });
        }
        return records;
    }

}

module.exports = new SourceStore();
