const BaseParser = require('./base-parser');
const FamilyParser = require('./family-parser');
const PersonParser = require('./person-parser');

module.exports = {
    BaseParser,
    FamilyParser,
    PersonParser,
    makeFamilyId: BaseParser.makeFamilyId,
    eventTagsToKeys: BaseParser.eventTagsToKeys,
};
