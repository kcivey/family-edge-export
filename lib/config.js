const os = require('os');
const moment = require('moment');
const dosBoxBin = '/usr/bin/dosbox';
const edgeDir = os.homedir() + '/dos/F-EDGE';
const outFile = edgeDir + '/DATA/' + moment().format('DMMMYY').toUpperCase() + '.DOC';

module.exports = {dosBoxBin, edgeDir, outFile};
