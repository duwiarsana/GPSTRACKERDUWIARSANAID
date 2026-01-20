const crypto = require('crypto');

function newObjectId() {
  return crypto.randomBytes(12).toString('hex');
}

module.exports = { newObjectId };
