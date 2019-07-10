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

    getCitation(title) {
        return {tag: 'SOUR', data: this.getPointer(title), tree: []};
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
