'use strict';

const fs = require('fs-extra');
const readline = require('readline');
const RecognizedError = require('./RecognizedError');

/**
 * Reads and parses a map file.
 *
 * @param {string} path Filepath of map file.
 * @returns {object} Keys are the decimal value of the addresses from the map
 * file (Ex: '2147505856' for 0x800056c0, '416' for 0x1a0), and values are the
 * names from the map (Ex: 'version_check__Fv', 'get_pla__FP10fopAc_ac_c').
 */
async function readMap(path) {
  if (!fs.existsSync(path)) {
    throw new RecognizedError(
      `Map file missing: '${path}'\nDid you add them according to the README?`
    );
  }

  const map = {};

  const fileStream = fs.createReadStream(path);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let foundTextSection = false;

  for await (const line of rl) {
    if (!foundTextSection) {
      if (line.indexOf('.text section layout') === 0) {
        foundTextSection = true;
      }
      continue;
    }

    const result = parseLine(line);
    if (!result) {
      break;
    }

    map[result.address] = result.name;
  }

  return map;
}

/**
 * Pulls out the address and name from a line of the map file.
 *
 * @param {string} line Line from the map file.
 * @returns {object} Object containing the address and name from a line of the
 * map file.
 */
function parseLine(line) {
  if (!line) {
    return null;
  }

  const match = line.match(
    /^\s*[0-9a-f]{8}\s*[0-9a-f]{6}\s*([0-9a-f]{8})\s*\d*\s*(\S*)/
  );
  if (!match) {
    return null;
  }

  const address = Number('0x' + match[1]);
  if (typeof address !== 'number') {
    return null;
  }

  return {
    address,
    name: match[2],
  };
}

module.exports = {
  readMap,
};
