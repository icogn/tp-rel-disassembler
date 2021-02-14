'use strict';

const {
  disassemble,
  getGprName,
  getFprName,
} = require('./dolphin/GekkoDisassembler');

module.exports = {
  disassemble,
  getGprName,
  getFprName,
};
