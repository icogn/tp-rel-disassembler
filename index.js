'use strict';

const chalk = require('chalk');
const fs = require('fs-extra');
const meow = require('meow');
const path = require('path');
const { sprintf } = require('sprintf-js');
const findRels = require('./src/findRels');
const { readMap } = require('./src/mapReader');
const RecognizedError = require('./src/RecognizedError');
const { processRel } = require('./src/relProcessor');

// Used to clear most significant bit.
const clearMsb = 0x7fffffff;

// Could update to handle other versions in future
const version = 'gc.us';
// Array of DynamicModuleControl pointers (word). Not all indexes are actually
// used. Each DynamicModuleControl it points to is 0x2c bytes long. This offset
// value is version dependent.
const c_dylink_DMC_offset = 0x3f0f50;
// Number of words in c_dylink_DMC Array
const DMC_length = 0x318;

/**
 * Determines if the bytes starting at bufOffset in buffer are a null-terminated
 * string which is equivalent to str.
 *
 * @param {string} str Value we are looking for.
 * @param {Buffer} buffer Buffer which contains strings.
 * @param {number} bufOffset Offset in buffer which is the start of a string.
 * @returns {boolean} true if matches, else false
 */
function strcmp(str, buffer, bufOffset) {
  if (str.length <= 0) {
    return false;
  }

  const len = str.length;
  for (let i = 0; i < len; i++) {
    if (str.charCodeAt(i) !== buffer[bufOffset + i]) {
      return false;
    }
  }
  return buffer[bufOffset + str.length] === 0;
}

/**
 * Returns a Buffer which is a subset of the RAM dump buffer. The Buffer starts
 * where the REL's data does, and it is long enough to contain any REL data we
 * need to read.
 *
 * @param {Buffer} dumpBuffer Buffer of RAM dump.
 * @param {number} relPtr Address of REL data in RAM. Looks like 8xxxxxxx.
 * @returns {Buffer} Buffer which contains enough of the REL's data within it
 * for this tool's purposes.
 */
function getRelBuffer(dumpBuffer, relPtr) {
  const relOffset = relPtr & clearMsb;
  const impPtr = dumpBuffer.readUInt32BE(relOffset + 0x28);
  // Data we are concerned with should be in this range.
  const approxRelLength = impPtr - relPtr;

  return dumpBuffer.slice(relOffset, relOffset + approxRelLength);
}

/**
 * Tries to find a REL name based on the user-provided REL identifier. If there
 * are multiple possibilities, prints them and exits the program.
 *
 * @param {string} relId User-provided REL identifier which is used to try to
 * find a matching REL name.
 * @returns {string} name of REL to process (Ex: 'd_a_e_rd')
 */
function findRelName(relId) {
  let target = relId;
  const periodIndex = target.indexOf('.');
  if (periodIndex >= 0) {
    target = target.substring(0, periodIndex);
  }

  const resultsArr = findRels(target);

  if (resultsArr.length > 1) {
    console.log('\nDid you mean one of the following?\n');
    resultsArr.forEach((obj) => {
      const notesText = obj.notes ? ` (${obj.notes})` : '';
      console.log(
        `  ${sprintf('%04x', obj.id)} ${chalk.cyan(obj.name)} : ${
          obj.readable
        }${notesText}`
      );
    });
    process.exit(1);
  } else if (resultsArr.length === 1) {
    return resultsArr[0].name;
  } else {
    throw new RecognizedError(`No results for '${relId}'.`);
  }
}

/**
 * Given a REL name and the RAM dump buffer, finds the address of the REL data
 * if the REL is loaded in the RAM dump.
 *
 * @param {Buffer} dumpBuffer Buffer of RAM dump
 * @param {string} relName Name of REL
 * @returns {number} Address of start of REL data
 */
function findRelPointer(dumpBuffer, relName) {
  let dynamicModuleControlPtr = 0;

  for (let i = 0; i < DMC_length; i++) {
    const dmcPtr = dumpBuffer.readUInt32BE(c_dylink_DMC_offset + i * 4);
    if (dmcPtr !== 0) {
      const moduleNamePtr =
        dumpBuffer.readUInt32BE((dmcPtr & clearMsb) + 0x1c) & clearMsb;
      if (moduleNamePtr !== 0 && strcmp(relName, dumpBuffer, moduleNamePtr)) {
        dynamicModuleControlPtr = dmcPtr;
        break;
      }
    }
  }

  if (dynamicModuleControlPtr === 0) {
    throw new RecognizedError(
      `Did not find DynamicModuleControl for '${relName}'.`
    );
  }

  const relPtr = dumpBuffer.readUInt32BE(
    (dynamicModuleControlPtr & clearMsb) + 0x10
  );

  if (relPtr === 0) {
    throw new RecognizedError(`REL '${relName}' is not loaded in RAM dump.`);
  }

  return relPtr;
}

async function main() {
  const cli = meow(
    `
  Usage
    $ node index.js -i <ram_dump.raw> -r <rel_identifier>


  Options
    -i, --input   Path to RAM dump file.
    -r, --rel-id  rel identifier which can be one of the following:
                    - hex id (ex: 3a, 0x96)
                    - name (ex: d_a_midna, e_rd)
                    - approximate name (ex: zant, lv5)`,
    {
      flags: {
        input: { type: 'string', isRequired: true, alias: 'i' },
        relId: { type: 'string', isRequired: true, alias: 'r' },
      },
    }
  );

  const { input, relId } = cli.flags;

  console.log(`Determining REL ...`);
  const relName = findRelName(relId);
  console.log(`Disassembling ${chalk.cyan(relName)} ...`);

  if (!fs.existsSync(input)) {
    throw new RecognizedError(`RAM dump does not exist: '${input}'`);
  }

  const dumpBuffer = fs.readFileSync(input);
  // Could add logic to determine TP version by reading start of buffer

  const frameworkMap = await readMap(
    path.join(__dirname, `map/${version}/frameworkF.map`)
  );
  const relMap = await readMap(
    path.join(__dirname, `map/${version}/${relName}.map`)
  );

  const relPtr = findRelPointer(dumpBuffer, relName);
  const relBuffer = getRelBuffer(dumpBuffer, relPtr);

  const partialPath = path.join('output', version);
  const outputFileName = `${relName}-disassembled.txt`;

  const wroteFile = await processRel(
    relBuffer,
    relPtr,
    relName,
    relMap,
    frameworkMap,
    path.join(__dirname, partialPath, outputFileName)
  );

  if (wroteFile) {
    const prettyPathName = partialPath.replace('\\', '/');
    console.log(
      `\nCreated file:\n\n  ${prettyPathName}/${chalk.cyan(outputFileName)}`
    );
  }
}

// Only print stack trace if error was unexpected.
async function mainWrapper() {
  try {
    await main();
  } catch (e) {
    if (e instanceof RecognizedError) {
      console.error(chalk.red('\n' + e.message));
      process.exit(1);
    } else {
      throw e;
    }
  }
}

mainWrapper();
