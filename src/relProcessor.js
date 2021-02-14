'use strict';

const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const { sprintf } = require('sprintf-js');
const askYesNo = require('./askYesNo');
const { disassemble } = require('./disassembler');

// Used to clear most significant bit.
const clearMsb = 0x7fffffff;

// prettier-ignore
const labelNames = [
  'APPLE',      'BANANA',    'CHOCOLATE', 'DONUT',     'EGGPLANT', 'FLAMINGO',
  'GRAPEFRUIT', 'HARPOON',   'IGLOO',     'JELLYFISH', 'KAYAK',    'LOBSTER',
  'MILK',       'NOODLE',    'ORANGE',    'PAPER',     'QUARTZ',   'RASPBERRY',
  'SANDWICH',   'TANGERINE', 'UNICORN',   'VIOLIN',    'WATER',    'XRAY',
  'YOYO',       'ZEBRA',
];

const EQUALS_DIVIDER = '==================================================\n';

let relBuffer = null;
let relPtr = 0;
let relName = '';
let relMap = {};
let frameworkMap = {};
let outputFile = null;

// branchDestinations shape:
// {
//   functionOffsetInSection: { // Ex: '148'
//     'destAddress': 'BASE_LABEL', // Ex: 2161270244: 'APPLE'
//     'destAddress2': 'BASE_LABEL_2', // Ex: 2161270272: 'FINISH_FUNCTION'
//   },
// }
const branchDestinations = {};

/**
 * Asks user if they would like to overwrite existing outputFile.
 *
 * @returns {boolean} true if can write, false if cannot
 */
async function checkCanWriteFile() {
  if (fs.existsSync(outputFile)) {
    return await askYesNo(
      `\nFile '${path.basename(outputFile)}' already exists. Overwrite ? [y/N]`,
      (answer) => answer.length > 0 && answer[0].toLowerCase() === 'y'
    );
  }
  return true;
}

/**
 * Processes the REL data in the RAM dump, and creates an output file with the
 * disassembled instructions.
 *
 * @param {Buffer} relBufferIn Contains REL data from RAM dump.
 * @param {number} relPtrIn Address of start of REL data in memory
 * @param {string} relNameIn Name of REL (Ex: d_a_midna)
 * @param {object} relMapIn Data from parsed map file for REL
 * @param {object} frameworkMapIn Data from parsed frameworkF.map
 * @param {string} outputFileIn Filepath to write disassembled output to.
 * @returns {boolean} true if wrote file, else false
 */
async function processRel(
  relBufferIn,
  relPtrIn,
  relNameIn,
  relMapIn,
  frameworkMapIn,
  outputFileIn
) {
  relBuffer = relBufferIn;
  relPtr = relPtrIn;
  relName = relNameIn;
  relMap = relMapIn;
  frameworkMap = frameworkMapIn;
  outputFile = outputFileIn;

  const numSections = relBuffer.readUInt32BE(0xc);
  const sectionInfoAddr = relBuffer.readUInt32BE(0x10);

  let textSection = null;
  let numTextSections = 0;

  for (let i = 0; i < numSections; i++) {
    const sectionTableEntryOffset =
      (sectionInfoAddr + i * 8 - relPtr) & clearMsb;
    const firstWord = relBuffer.readUInt32BE(sectionTableEntryOffset);
    const sectionLength = relBuffer.readUInt32BE(sectionTableEntryOffset + 4);

    // Prevent sign-extending first 32 bits.
    const sectionAddr =
      (firstWord & 0xfffffffc) + (firstWord & 0x80000000 ? 0x100000000 : 0);

    if (firstWord & 1) {
      // section is executable
      numTextSections++;
      if (!textSection) {
        textSection = { address: sectionAddr, length: sectionLength };
      }
    }
  }

  if (numTextSections > 1) {
    console.warn(
      chalk.yellow(
        `Found ${numTextSections} text sections, but only designed to handle 1 right now.`
      )
    );
  }

  if (textSection) {
    await fs.mkdirp(path.dirname(outputFile));

    const canWriteOutput = await checkCanWriteFile();
    if (!canWriteOutput) {
      console.error(chalk.red('Not overwriting - exiting'));
      return;
    }

    processTextSection(textSection.address, textSection.length);

    return true;
  }
  return false;
}

/**
 * Disassembles text section and writes to output file.
 *
 * @param {number} sectionAddr Address of text section
 * @param {number} sectionLength Length of text section
 */
function processTextSection(sectionAddr, sectionLength) {
  populateBranchDestinations(sectionAddr, sectionLength);

  fs.removeSync(outputFile);

  const stream = fs.createWriteStream(outputFile, { flags: 'a' });

  stream.write(`${relName}.rel\n\n`);

  let startingNewFn = true;
  let leaveBlankLine = false;

  let currRelFnOffset = 0;

  disassembleSection(sectionAddr, sectionLength, (instr, offsetInSection) => {
    if (relMap[offsetInSection]) {
      currRelFnOffset = offsetInSection;
    }

    const match = instr.match(/^(b[\S]*)\s*->0x([0-9a-f]{8})/);
    if (match) {
      const branchInstr = match[1];
      if (branchInstr === 'bl') {
        const blTarget = Number('0x' + match[2]);
        let blName = frameworkMap[blTarget];
        let relOffsetText = '';
        if (!blName) {
          const a = (blTarget - sectionAddr) & clearMsb;
          relOffsetText = sprintf('0x%x ', a);
          blName = relMap[a];
        }
        if (blName) {
          instr += ` ___ ${match[2]} ${relOffsetText}${blName} ___`;
        } else {
          instr += ' UNRECOGNIZED BRANCH';
        }
      } else if (branchInstr !== 'blr') {
        const targetAddr = Number('0x' + match[2]);
        const targetName = branchDestinations[currRelFnOffset][targetAddr];
        if (targetName) {
          instr += ` ===> ${targetName}_${match[2]}`;
        } else {
          instr += ' UNRECOGNIZED BRANCH TARGET';
        }
      }
    }

    if (leaveBlankLine) {
      leaveBlankLine = false;
      stream.write('\n');
    } else if (startingNewFn) {
      startingNewFn = false;
      if (offsetInSection > 0) {
        stream.write('\n\n');
      }

      const fnName = relMap[offsetInSection] || 'UNKNOWN FUNCTION';

      stream.write(EQUALS_DIVIDER);
      stream.write(
        sprintf(
          `0x%x %08x %s:\n`,
          offsetInSection,
          (0x80000000 | sectionAddr) + offsetInSection,
          fnName
        )
      );
      stream.write(EQUALS_DIVIDER);
    }

    if (branchDestinations[currRelFnOffset][sectionAddr + offsetInSection]) {
      stream.write(
        sprintf(
          '%s_%08x:\n',
          branchDestinations[currRelFnOffset][sectionAddr + offsetInSection],
          sectionAddr + offsetInSection
        )
      );
    }

    stream.write(`\t${instr}\n`);

    if (match && match[1] === 'b') {
      leaveBlankLine = true;
    } else if (/^blr\s$/.test(instr)) {
      if (branchDestinations[offsetInSection + 4]) {
        startingNewFn = true;
      } else {
        leaveBlankLine = true;
      }
    }
  });

  stream.end();
}

/**
 * Scans through the text section and keeps track of destination addresses of
 * different branch instructions.
 *
 * @param {number} sectionAddr Address of text section
 * @param {number} sectionLength Length of text section
 */
function populateBranchDestinations(sectionAddr, sectionLength) {
  const obj = {};

  let currRelFnOffset = 0;

  disassembleSection(sectionAddr, sectionLength, (instr, offsetInSection) => {
    if (relMap[offsetInSection]) {
      currRelFnOffset = offsetInSection;
      obj[currRelFnOffset] = {};
    }
    const match = instr.match(/^(b[\S]*)\s*->0x([0-9a-f]{8})/);
    if (!match) {
      return;
    }
    const branchInstr = match[1];
    if (branchInstr !== 'bl') {
      const fnObj = obj[currRelFnOffset];
      const bDestNum = Number('0x' + match[2]);
      if (!fnObj[bDestNum]) {
        fnObj[bDestNum] = { reachedFromBelow: false };
        // console.log('2nd thing branching to same location');
      }

      if (!fnObj[bDestNum].reachedFromBelow) {
        const currAddr = sectionAddr + offsetInSection;
        if (currAddr > bDestNum) {
          fnObj[bDestNum].reachedFromBelow = true;
        }
      }
    }
  });

  Object.keys(obj).forEach((fnOffset) => {
    const fnObj = obj[fnOffset];
    const arr = Object.keys(fnObj).sort();
    let addrForFinishFn = null;

    if (arr.length > 0 && !fnObj[arr[arr.length - 1]].reachedFromBelow) {
      addrForFinishFn = arr[arr.length - 1];
    }

    const resultObj = {};
    let labelIndex = 0;
    Object.keys(fnObj).forEach((bDest) => {
      if (bDest === addrForFinishFn) {
        resultObj[bDest] = 'FINISH_FUNCTION';
      } else if (labelIndex < 26) {
        resultObj[bDest] = labelNames[labelIndex];
      } else {
        const numChars = Math.floor(labelIndex / 26);
        const character = String.fromCharCode(0x61 + (labelIndex % 26));
        let label = '';
        for (let i = 0; i < numChars; i++) {
          label += character;
        }
        resultObj[bDest] = label;
      }
      labelIndex++;
    });

    branchDestinations[fnOffset] = resultObj;
  });
}

/**
 * Iterates through the text section, and notifies the callback of every
 * disassembled instruction.
 *
 * @param {number} sectionAddr Address of text section
 * @param {number} sectionLength Length of text section
 * @param {function} callback Notified after each instructions is disassembled.
 * Params are the instruction text and the offset to the instruction in the text
 * section.
 */
function disassembleSection(sectionAddr, sectionLength, callback) {
  const sectionOffset = sectionAddr - relPtr;

  for (
    let offsetInSection = 0;
    offsetInSection < sectionLength;
    offsetInSection += 4
  ) {
    const word = relBuffer.readUInt32BE(sectionOffset + offsetInSection);
    let instr = disassemble(word, sectionAddr + offsetInSection);

    callback(instr, offsetInSection);
  }
}

module.exports = {
  processRel,
};
