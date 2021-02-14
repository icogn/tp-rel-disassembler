'use strict';

class RecognizedError extends Error {
  constructor(message) {
    super(message);
  }
}

module.exports = RecognizedError;
