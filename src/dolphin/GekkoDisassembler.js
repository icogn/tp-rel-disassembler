// Copyright 2014 Dolphin Emulator Project
// Licensed under GPLv2+
// Refer to the license.txt file included in the directory with this file.

/* $VER: ppc_disasm.c V1.5 (27.05.2009)
 *
 * Disassembler module for the PowerPC microprocessor family
 * Copyright (c) 1998-2001,2009,2011 Frank Wille
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

// Modified for use with Dolphin

// Ported 'dolphin/Source/Core/Common/GekkoDisassembler.cpp' to JavaScript with
// slight modifications.
'use strict';

const { sprintf } = require('sprintf-js');

const PPCINSTR = {
  OTHER: 0, // No additional info for other instr
  BRANCH: 1, // Branch dest. = PC+displacement
  LDST: 2, // Load/store instruction: displ(sreg)
  IMM: 3, // 16-bit immediate val. in displacement
};

const PPCF = {
  ILLEGAL: 1 << 0, // Illegal PowerPC instruction
  UNSIGNED: 1 << 1, // Unsigned immediate instruction
  SUPER: 1 << 2, // Supervisor level instruction
  SIXTY_FOUR: 1 << 3, // 64-bit only instruction
};

const PPCIDXMASK = 0xfc000000;
const PPCIDX2MASK = 0x000007fe;
const PPCDMASK = 0x03e00000;
const PPCAMASK = 0x001f0000;
const PPCBMASK = 0x0000f800;
const PPCCMASK = 0x000007c0;
const PPCMMASK = 0x0000003e;
const PPCCRDMASK = 0x03800000;
const PPCCRAMASK = 0x001c0000;
const PPCLMASK = 0x00600000;
const PPCOE = 0x00000400;
const PPCVRC = 0x00000400;
const PPCDST = 0x02000000;
const PPCSTRM = 0x00600000;

const PPCIDXSH = 26;
const PPCDSH = 21;
const PPCASH = 16;
const PPCBSH = 11;
const PPCCSH = 6;
const PPCMSH = 1;
const PPCCRDSH = 23;
const PPCCRASH = 18;
const PPCLSH = 21;
const PPCIDX2SH = 1;

function createGetFromMask(mask, shiftAmt) {
  return function (instr) {
    return (instr & mask) >>> shiftAmt;
  };
}

const PPCGETIDX = createGetFromMask(PPCIDXMASK, PPCIDXSH);
const PPCGETD = createGetFromMask(PPCDMASK, PPCDSH);
const PPCGETA = createGetFromMask(PPCAMASK, PPCASH);
const PPCGETB = createGetFromMask(PPCBMASK, PPCBSH);
const PPCGETC = createGetFromMask(PPCCMASK, PPCCSH);
const PPCGETM = createGetFromMask(PPCMMASK, PPCMSH);
const PPCGETCRD = createGetFromMask(PPCCRDMASK, PPCCRDSH);
const PPCGETCRA = createGetFromMask(PPCCRAMASK, PPCCRASH);
const PPCGETL = createGetFromMask(PPCLMASK, PPCLSH);
const PPCGETIDX2 = createGetFromMask(PPCIDX2MASK, PPCIDX2SH);
const PPCGETSTRM = createGetFromMask(PPCSTRM, PPCDSH);

// prettier-ignore
const trap_condition = [
  null, "lgt", "llt", null, "eq", "lge", "lle", null,
  "gt", null,  null,  null, "ge", null,  null,  null,
  "lt", null,  null,  null, "le", null,  null,  null,
  "ne", null,  null,  null, null, null,  null,  null,
];

const cmpname = ['cmpw', 'cmpd', 'cmplw', 'cmpld'];

const ps_cmpname = ['ps_cmpu0', 'ps_cmpo0', 'ps_cmpu1', 'ps_cmpo1'];

const b_ext = ['', 'l', 'a', 'la'];

const b_condition = ['ge', 'le', 'ne', 'ns', 'lt', 'gt', 'eq', 'so'];

// prettier-ignore
const b_decr = [ 
  "nzf", "zf", null, null, "nzt", "zt", null, null,
  "nz",  "z",  null, null, "nz",  "z",  null, null,
];

const regsel = ['', 'r'];

const oesel = ['', 'o'];

const rcsel = ['', '.'];

// prettier-ignore
const ldstnames = [
  "lwz", "lwzu", "lbz", "lbzu", "stw",  "stwu",  "stb",  "stbu",
  "lhz", "lhzu", "lha", "lhau", "sth",  "sthu",  "lmw",  "stmw",
  "lfs", "lfsu", "lfd", "lfdu", "stfs", "stfsu", "stfd", "stfdu",
];

// prettier-ignore
const regnames = [
  "r0",  "sp",  "rtoc", "r3",  "r4",  "r5",  "r6",  "r7",  "r8",  "r9",  "r10",
  "r11", "r12", "r13",  "r14", "r15", "r16", "r17", "r18", "r19", "r20", "r21",
  "r22", "r23", "r24",  "r25", "r26", "r27", "r28", "r29", "r30", "r31",
];

let m_instr = null;
let m_iaddr = null;
let m_opcode = '';
let m_operands = '';
let m_type = 0;
let m_flags = PPCF.ILLEGAL;
let m_sreg = 0;
let m_displacement = 0;

/**
 * @param {number} r
 * @param {number} mb
 * @param {number} me
 * @returns {u32}
 */
function HelperRotateMask(r, mb, me) {
  // first make 001111111111111 part
  let begin = 0xffffffff >>> mb;
  // then make 000000000001111 part, which is used to flip the bits of the first one
  let end = me < 31 ? 0xffffffff >>> (me + 1) : 0;
  // do the bitflip
  let mask = begin ^ end;
  // and invert if backwards
  if (me < mb) {
    mask = ~mask;
  }
  // rotate the mask so it can be applied to source reg
  return (mask << (32 - r)) | (mask >>> r);
}

/**
 * @param {number} val
 * @returns {string}
 */
function ldst_offs(val) {
  if (val === 0) {
    return '0';
  } else if (val & 0x8000) {
    return sprintf('-0x%04x', (~val & 0xffff) + 1);
  }
  return sprintf('0x%04x', val);
}

/**
 * Sign-extends first 12 bits.
 *
 * @param {number} x Value to sign-extend.
 * @returns {number} Sign-extended value.
 */
function SEX12(x) {
  if ((x & 0x800) !== 0) {
    return x | 0xfffff000;
  }
  return x;
}

const sprNumToName = {
  1: 'XER',
  8: 'LR',
  9: 'CTR',
  18: 'DSIR',
  19: 'DAR',
  22: 'DEC',
  25: 'SDR1',
  26: 'SRR0',
  27: 'SRR1',
  272: 'SPRG0',
  273: 'SPRG1',
  274: 'SPRG2',
  275: 'SPRG3',
  282: 'EAR',
  287: 'PVR',
  528: 'IBAT0U',
  529: 'IBAT0L',
  530: 'IBAT1U',
  531: 'IBAT1L',
  532: 'IBAT2U',
  533: 'IBAT2L',
  534: 'IBAT3U',
  535: 'IBAT3L',
  536: 'DBAT0U',
  537: 'DBAT0L',
  538: 'DBAT1U',
  539: 'DBAT1L',
  540: 'DBAT2U',
  541: 'DBAT2L',
  542: 'DBAT3U',
  543: 'DBAT3L',
  912: 'GQR0',
  913: 'GQR1',
  914: 'GQR2',
  915: 'GQR3',
  916: 'GQR4',
  917: 'GQR5',
  918: 'GQR6',
  919: 'GQR7',
  920: 'HID2',
  921: 'WPAR',
  922: 'DMA_U',
  923: 'DMA_L',
  924: 'ECID_U',
  925: 'ECID_M',
  926: 'ECID_L',
  936: 'UMMCR0',
  937: 'UPMC1',
  938: 'UPMC2',
  939: 'USIA',
  940: 'UMMCR1',
  941: 'UPMC3',
  942: 'UPMC4',
  943: 'USDA',
  952: 'MMCR0',
  953: 'PMC1',
  954: 'PMC2',
  955: 'SIA',
  956: 'MMCR1',
  957: 'PMC3',
  958: 'PMC4',
  959: 'SDA',
  1008: 'HID0',
  1009: 'HID1',
  1010: 'IABR',
  1011: 'HID4',
  1013: 'DABR',
  1017: 'L2CR',
  1019: 'ICTC',
  1020: 'THRM1',
  1021: 'THRM2',
  1022: 'THRM3',
};

/**
 * Converts a spr number to a string name.
 *
 * @param {number} i spr number
 * @returns {string} name of spr
 */
function spr_name(i) {
  return sprNumToName[i] || String(i);
}

/**
 * Swaps bits under PPCAMASK and PPCDMASK.
 *
 * @param {number} w Word
 * @returns {number} Word with bits swapped.
 */
function swapda(w) {
  return (w & 0xfc00ffff) | ((w & PPCAMASK) << 5) | ((w & PPCDMASK) >> 5);
}

/**
 * Swaps bits under PPCBMASK and PPCAMASK.
 *
 * @param {number} w Word
 * @returns {number} Word with bits swapped.
 */
function swapab(w) {
  return (w & 0xffe007ff) | ((w & PPCBMASK) << 5) | ((w & PPCAMASK) >> 5);
}

/**
 * Handle illegal instruction.
 *
 * @param {number} inOp
 */
function ill(inOp) {
  if (inOp == 0) {
    m_opcode = '';
    m_operands = '---';
  } else {
    m_opcode = '(ill)';
    m_operands = sprintf('%08x', inOp);
  }

  m_flags |= PPCF.ILLEGAL;
}

/**
 * Generate immediate instruction operand.
 *
 * Type 0: D-mode, D,A,imm
 * Type 1: S-mode, A,S,imm
 * Type 2: S/D register is ignored (trap,cmpi)
 * Type 3: A register is ignored (li)
 *
 * @param {number} inVal
 * @param {number} uimm
 * @param {number} type
 * @param {boolean} hex
 * @returns
 */
function imm(inVal, uimm, type, hex) {
  // Adding to always show hex:
  hex = true;

  let i = inVal & 0xffff;

  m_type = PPCINSTR.IMM;

  if (uimm == 0) {
    if (i > 0x7fff) i -= 0x10000;
  } else {
    m_flags |= PPCF.UNSIGNED;
  }
  m_displacement = i;

  switch (type) {
    case 0:
      // Changing to always show hex. Was (%s, %s, %s, ...
      return sprintf(
        '%s, %s, 0x%x',
        regnames[PPCGETD(inVal)],
        regnames[PPCGETA(inVal)],
        i
      );
    case 1:
      if (hex) {
        return sprintf(
          '%s, %s, 0x%04x',
          regnames[PPCGETA(inVal)],
          regnames[PPCGETD(inVal)],
          i
        );
      } else {
        return sprintf(
          '%s, %s, %s',
          regnames[PPCGETA(inVal)],
          regnames[PPCGETD(inVal)],
          i
        );
      }
    case 2:
      return sprintf('%s, %s', regnames[PPCGETA(inVal)], i);
    case 3:
      if (hex) {
        return sprintf('%s, 0x%04x', regnames[PPCGETD(inVal)], i);
      } else {
        return sprintf('%s, %s', regnames[PPCGETD(inVal)], i);
      }
    default:
      return 'imm(): Wrong type';
  }
}

/**
 * @param {u32} inVal
 * @returns {string}
 */
function ra_rb(inVal) {
  return sprintf('%s, %s', regnames[PPCGETA(inVal)], regnames[PPCGETB(inVal)]);
}

/**
 * @param {u32} inVal
 * @param {int} mask
 * @returns {string}
 */
function rd_ra_rb(inVal, mask) {
  let result = '';

  if (mask) {
    if (mask & 4) {
      result += sprintf('%s, ', regnames[PPCGETD(inVal)]);
    }
    if (mask & 2) {
      result += sprintf('%s, ', regnames[PPCGETA(inVal)]);
    }
    if (mask & 1) {
      result += sprintf('%s, ', regnames[PPCGETB(inVal)]);
    }

    const pos = result.lastIndexOf(', ');
    if (pos >= 0) {
      result = result.substring(0, pos);
      // result.erase(pos, result.length() - pos);
    }
  }

  return result;
}

/**
 * @param {u32} inVal
 * @param {int} mask
 * @returns {string}
 */
function fd_ra_rb(inVal, mask) {
  let result = '';

  if (mask) {
    if (mask & 4) {
      result += sprintf('f%s,', PPCGETD(inVal));
    }
    if (mask & 2) {
      result += sprintf('%s,', regnames[PPCGETA(inVal)]);
    }
    if (mask & 1) {
      result += sprintf('%s,', regnames[PPCGETB(inVal)]);
    }

    // Drop the trailing comma
    result = result.slice(0, -1);
  }

  return result;
}

/**
 * @param {u32} inVal
 * @param {number} dmode
 */
function trapi(inVal, dmode) {
  // const char* cnd = trap_condition[PPCGETD(inVal)];
  const cnd = trap_condition[PPCGETD(inVal)];

  m_flags |= dmode;
  if (cnd != null) {
    m_opcode = sprintf('t%s%s', dmode ? 'd' : 'w', cnd);
  } else {
    m_opcode = sprintf('t%si', dmode ? 'd' : 'w');
    m_operands = sprintf('%s, ', PPCGETD(inVal));
  }
  m_operands += imm(inVal, 0, 2, false);
}

/**
 * @param {u32} inVal
 * @param {int} uimm
 */
function cmpi(inVal, uimm) {
  let i = PPCGETL(inVal);

  if (i < 2) {
    if (i != 0) {
      m_flags |= PPCF.SIXTY_FOUR;
    }
    m_opcode = sprintf('%si', cmpname[uimm * 2 + i]);

    i = PPCGETCRD(inVal);
    if (i != 0) {
      m_operands += sprintf('cr%s, ', i);
    }

    m_operands += imm(inVal, uimm, 2, false);
  } else {
    ill(inVal);
  }
}

/**
 * @param {u32} inVal
 * @param {string} ext
 */
function addi(inVal, ext) {
  if (inVal & 0x08000000 && !PPCGETA(inVal)) {
    // li, lis
    m_opcode = sprintf('l%s', ext);

    if (ext == 'i') {
      m_operands = imm(inVal, 0, 3, false);
    } else {
      m_operands = imm(inVal, 1, 3, true);
    }
  } else {
    m_opcode = sprintf('%s%s', inVal & 0x8000 ? 'sub' : 'add', ext);

    if (inVal & 0x8000) {
      inVal = (inVal ^ 0xffff) + 1;
    }

    m_operands = imm(inVal, 1, 0, false);
  }
}

/**
 * Build a branch instr. and return number of chars written to operand.
 *
 * @param {u32} inVal
 * @param {string} bname
 * @param {int} aform
 * @param {int} bdisp
 * @returns {number} Number of chars written to operand
 */
function branch(inVal, bname, aform, bdisp) {
  let bo = PPCGETD(inVal);
  let bi = PPCGETA(inVal);
  let y = bo & 1;
  const ext = b_ext[aform * 2 + (inVal & 1)];

  if (bdisp < 0) {
    y ^= 1;
  }
  y = y != 0 ? '+' : '-';

  if (bo & 4) {
    // standard case - no decrement
    if (bo & 16) {
      // branch always
      if (PPCGETIDX(inVal) != 16) {
        m_opcode = sprintf('b%s%s', bname, ext);
      } else {
        m_opcode = sprintf('bc%s', ext);
        m_operands = sprintf('%s, %s', bo, bi);
      }
    } else {
      // Branch conditional
      m_opcode = sprintf(
        'b%s%s%s%s',
        b_condition[((bo & 8) >> 1) + (bi & 3)],
        bname,
        ext,
        y
      );

      if (bi >= 4) {
        m_operands = sprintf('cr%s', bi >> 2);
      }
    }
  } else {
    // CTR is decremented and checked
    m_opcode = sprintf('bd%s%s%s%s', b_decr[bo >> 1], bname, ext, y);

    if ((bo & 16) == 0) {
      m_operands = String(bi);
    }
  }

  return m_operands.length;
}

/**
 * @param {u32} inVal
 */
function bc(inVal) {
  let d = inVal & 0xfffc;

  if (d & 0x8000) {
    d |= 0xffff0000;
  }

  branch(inVal, '', inVal & 2 ? 1 : 0, d);

  if (inVal & 2) {
    // AA ?
    m_operands = sprintf('%s ->0x%08x', m_operands, d);
  } else {
    m_operands = sprintf('%s ->0x%08x', m_operands, m_iaddr + d);
  }

  m_type = PPCINSTR.BRANCH;
  m_displacement = d;
}

/**
 * @param {u32} inVal
 */
function bli(inVal) {
  let d = inVal & 0x3fffffc;

  if (d & 0x02000000) {
    d |= 0xfc000000;
  }

  // m_opcode = fmt::format("b{}", b_ext[in & 3]);
  m_opcode = sprintf('b%s', b_ext[inVal & 3]);

  if (inVal & 2) {
    // AA ?
    // m_operands = fmt::format("->0x{:08X}", d);
    m_operands = sprintf('->0x%08x', d);
  } else {
    // m_operands = fmt::format("->0x{:08X}", *m_iaddr + d);
    m_operands = sprintf('->0x%08x', m_iaddr + d);
  }

  m_type = PPCINSTR.BRANCH;
  m_displacement = d;
}

/**
 * @param {u32} inVal
 * @param {string} suffix
 */
function mcrf(inVal, suffix) {
  if ((inVal & 0x0063f801) == 0) {
    // m_opcode = fmt::format("mcrf{}", suffix);
    m_opcode = sprintf('mcrf%s', suffix);
    // m_operands = fmt::format("cr{}, cr{}", PPCGETCRD(in), PPCGETCRA(in));
    m_operands = sprintf('cr%s, cr%s', PPCGETCRD(inVal), PPCGETCRA(inVal));
  } else {
    ill(inVal);
  }
}

/**
 * @param {u32} inVal
 * @param {string} n1
 * @param {string} n2
 */
function crop(inVal, n1, n2) {
  let crd = PPCGETD(inVal);
  let cra = PPCGETA(inVal);
  let crb = PPCGETB(inVal);

  if ((inVal & 1) == 0) {
    // m_opcode = fmt::format("cr{}", (cra == crb && !n2.empty()) ? n2 : n1);
    m_opcode = sprintf('cr%s', cra == crb && !n2.empty() ? n2 : n1);
    if (cra == crb && !n2.empty()) {
      // m_operands = fmt::format("{}, {}", crd, cra);
      m_operands = sprintf('%s, %s', crd, cra);
    } else {
      // m_operands = fmt::format("{}, {}, {}", crd, cra, crb);
      m_operands = sprintf('%s, %s, %s', crd, cra, crb);
    }
  } else {
    ill(inVal);
  }
}

/**
 * @param {u32} inVal
 * @param {string} name
 * @param {number} dmode
 */
function nooper(inVal, name, dmode) {
  if (inVal & (PPCDMASK | PPCAMASK | PPCBMASK | 1)) {
    ill(inVal);
  } else {
    m_flags |= dmode;
    m_opcode = name;
  }
}

/**
 * @param {u32} inVal
 * @param {string} name
 * @param {number} i
 */
function rlw(inVal, name, i) {
  let s = PPCGETD(inVal);
  let a = PPCGETA(inVal);
  let bsh = PPCGETB(inVal);
  let mb = PPCGETC(inVal);
  let me = PPCGETM(inVal);

  // m_opcode = fmt::format("rlw{}{}", name, (in & 1) ? "." : "");
  m_opcode = sprintf('rlw%s%s', name, inVal & 1 ? '.' : '');
  // m_operands = fmt::format("{}, {}, {}{}, {}, {} ({:08x})", regnames[a], regnames[s], regsel[i],
  //                          bsh, mb, me, HelperRotateMask(bsh, mb, me));
  m_operands = sprintf(
    '%s, %s, %s%s, %s, %s (%08x)',
    regnames[a],
    regnames[s],
    regsel[i],
    bsh,
    mb,
    me,
    HelperRotateMask(bsh, mb, me)
  );
}

/**
 * @param {u32} inVal
 * @param {string} name
 */
function ori(inVal, name) {
  m_opcode = name;
  m_operands = imm(inVal, 1, 1, true);
}

/**
 * @param {u32} inVal
 * @param {string} name
 * @param {int} i
 */
function rld(inVal, name, i) {
  let s = PPCGETD(inVal);
  let a = PPCGETA(inVal);
  let bsh = i ? PPCGETB(inVal) : ((inVal & 2) << 4) + PPCGETB(inVal);
  let m = (inVal & 0x7e0) >> 5;

  m_flags |= PPCF.SIXTY_FOUR;
  // m_opcode = fmt::format("rld{}{}", name, (in & 1) ? "." : "");
  m_opcode = sprintf('rld%s%s', name, inVal & 1 ? '.' : '');
  // m_operands = fmt::format("{}, {}, {}{}, {}", regnames[a], regnames[s], regsel[i], bsh, m);
  m_operands = sprintf(
    '%s, %s, %s%s, %s',
    regnames[a],
    regnames[s],
    regsel[i],
    bsh,
    m
  );
}

/**
 * @param {u32} inVal
 */
function cmp(inVal) {
  let i = PPCGETL(inVal);

  if (i < 2) {
    if (i != 0) {
      m_flags |= PPCF.SIXTY_FOUR;
    }

    m_opcode = cmpname[(inVal & PPCIDX2MASK ? 2 : 0) + i];

    i = PPCGETCRD(inVal);
    if (i != 0) {
      // m_operands += fmt::format("cr{},", i);
      m_operands += sprintf('cr%s,', i);
    }

    m_operands += ra_rb(inVal);
  } else {
    ill(inVal);
  }
}

/**
 * @param {u32} inVal
 * @param {int} dmode
 */
function trap(inVal, dmode) {
  let to = PPCGETD(inVal);
  const cnd = trap_condition[to];

  if (cnd != null) {
    m_flags |= dmode;
    // m_opcode = fmt::format('t{}{}', dmode ? 'd' : 'w', cnd);
    m_opcode = sprintf('t%s%s', dmode ? 'd' : 'w', cnd);
    m_operands = ra_rb(inVal);
  } else {
    if (to == 31) {
      if (dmode) {
        m_flags |= dmode;
        m_opcode = 'td';
        m_operands = '31,0,0';
      } else {
        m_opcode = 'trap';
      }
    } else {
      ill(inVal);
    }
  }
}

/**
 * Standard instruction: xxxx rD,rA,rB
 *
 * @param {u32} inVal
 * @param {string} name
 * @param {int} mask
 * @param {int} smode
 * @param {int} chkoe
 * @param {int} chkrc
 * @param {int} dmode
 */
function dab(inVal, name, mask, smode, chkoe, chkrc, dmode) {
  if (chkrc >= 0 && (inVal & 1) !== chkrc) {
    ill(inVal);
  } else {
    m_flags |= dmode;

    // rA,rS,rB
    if (smode) {
      inVal = swapda(inVal);
    }

    // m_opcode = fmt::format( '{}{}{}', name, oesel[chkoe && inVal & PPCOE], rcsel[chkrc < 0 && inVal & 1]);
    m_opcode = sprintf(
      '%s%s%s',
      name,
      oesel[(chkoe && inVal & PPCOE) || 0],
      rcsel[(chkrc < 0 && inVal & 1) || 0]
    );
    m_operands = rd_ra_rb(inVal, mask);
  }
}

/**
 * @param {u32} inVal
 * @param {string} name
 * @param {int} smode
 * @param {int} chkoe
 * @param {int} chkrc
 * @param {int} dmode
 */
function rrn(inVal, name, smode, chkoe, chkrc, dmode) {
  if (chkrc >= 0 && (inVal & 1) !== chkrc) {
    ill(inVal);
  } else {
    m_flags |= dmode;

    // rA,rS,NB
    if (smode) {
      inVal = swapda(inVal);
    }

    // m_opcode = fmt::format("{}{}{}", name, oesel[chkoe && (inVal & PPCOE)], rcsel[(chkrc < 0) && (inVal & 1)]);
    m_opcode = sprintf(
      '%s%s%s',
      name,
      oesel[(chkoe && inVal & PPCOE) || 0],
      rcsel[(chkrc < 0 && inVal & 1) || 0]
    );
    m_operands = rd_ra_rb(inVal, 6);
    // m_operands += fmt::format(",{}", PPCGETB(inVal));
    m_operands += sprintf(',%s', PPCGETB(inVal));
  }
}

/**
 * @param {u32} inVal
 */
function mtcr(inVal) {
  let s = PPCGETD(inVal);
  let crm = (inVal & 0x000ff000) >> 12;

  if (inVal & 0x00100801) {
    ill(inVal);
  } else {
    // m_opcode = fmt::format('mtcr{}', crm == 0xff ? '' : 'f');
    m_opcode = sprintf('mtcr%s', crm == 0xff ? '' : 'f');

    if (crm != 0xff) {
      // m_operands += fmt::format('0x{:02x},', crm);
      m_operands += sprintf('0x%02x,', crm);
    }

    m_operands += regnames[s];
  }
}

/**
 * @param {u32} inVal
 * @param {int} smode
 */
function msr(inVal, smode) {
  let s = PPCGETD(inVal);
  let sr = (inVal & 0x000f0000) >> 16;

  if (inVal & 0x0010f801) {
    ill(inVal);
  } else {
    m_flags |= PPCF.SUPER;
    // m_opcode = fmt::format("m{}sr", smode ? 't' : 'f');
    m_opcode = sprintf('m%ssr', smode ? 't' : 'f');

    if (smode) {
      // m_operands = fmt::format("{}, {}", sr, regnames[s]);
      m_operands = sprintf('%s, %s', sr, regnames[s]);
    } else {
      // m_operands = fmt::format("{}, {}", regnames[s], sr);
      m_operands = sprintf('%s, %s', regnames[s], sr);
    }
  }
}

/**
 * @param {u32} inVal
 * @param {int} smode
 */
function mspr(inVal, smode) {
  let d = PPCGETD(inVal);
  let spr = (PPCGETB(inVal) << 5) + PPCGETA(inVal);
  let fmt = 0;

  if (inVal & 1) {
    ill(inVal);
  } else {
    if (spr != 1 && spr != 8 && spr != 9) {
      m_flags |= PPCF.SUPER;
    }

    let x = null;
    switch (spr) {
      case 1:
        x = 'xer';
        break;
      case 8:
        x = 'lr';
        break;
      case 9:
        x = 'ctr';
        break;
      default:
        x = 'spr';
        fmt = 1;
        break;
    }

    // m_opcode = fmt::format("m{}{}", smode ? 't' : 'f', x);
    m_opcode = sprintf('m%s%s', smode ? 't' : 'f', x);

    if (fmt) {
      if (smode) {
        // m_operands = fmt::format('{}, {}', spr_name(spr), regnames[d]);
        m_operands = sprintf('%s, %s', spr_name(spr), regnames[d]);
      } else {
        // m_operands = fmt::format('{}, {}', regnames[d], spr_name(spr));
        m_operands = sprintf('%s, %s', regnames[d], spr_name(spr));
      }
    } else {
      m_operands = regnames[d];
    }
  }
}

/**
 * @param {u32} inVal
 */
function mtb(inVal) {
  let d = PPCGETD(inVal);
  let tbr = (PPCGETB(inVal) << 5) + PPCGETA(inVal);

  if (inVal & 1) {
    ill(inVal);
  } else {
    m_operands += regnames[d];

    let x = '';
    switch (tbr) {
      case 268:
        x = 'l';
        break;
      case 269:
        x = 'u';
        break;
      default:
        m_flags |= PPCF.SUPER;
        // m_operands += fmt::format(",{}", tbr);
        m_operands += sprintf(',%s', tbr);
        break;
    }

    m_opcode = sprintf('mftb%s', x);
  }
}

/**
 * @param {u32} inVal
 */
function sradi(inVal) {
  let s = PPCGETD(inVal);
  let a = PPCGETA(inVal);
  let bsh = ((inVal & 2) << 4) + PPCGETB(inVal);

  m_flags |= PPCF.SIXTY_FOUR;
  // m_opcode = fmt::format("sradi{}", (in & 1) ? "." : "");
  m_opcode = sprintf('sradi%s', inVal & 1 ? '.' : '');
  // m_operands = fmt::format("{}, {}, {}", regnames[a], regnames[s], bsh);
  m_operands = sprintf('%s, %s, %s', regnames[a], regnames[s], bsh);
}

/**
 * @param {u32} inVal
 * @param {string} name
 * @param {int} reg
 * @param {int} dmode
 */
function ldst(inVal, name, reg, dmode) {
  let s = PPCGETD(inVal);
  let a = PPCGETA(inVal);
  let d = inVal & 0xffff;

  m_type = PPCINSTR.LDST;
  m_flags |= dmode;
  m_sreg = a;
  //  if (d >= 0x8000)
  //    d -= 0x10000;
  m_displacement = d;
  m_opcode = name;

  if (reg == 'r') {
    // m_operands = fmt::format("{}, {} ({})", regnames[s], ldst_offs(d), regnames[a]);
    m_operands = sprintf('%s, %s (%s)', regnames[s], ldst_offs(d), regnames[a]);
  } else {
    // m_operands = fmt::format("{}{}, {} ({})", reg, s, ldst_offs(d), regnames[a]);
    m_operands = sprintf('%s%s, %s (%s)', reg, s, ldst_offs(d), regnames[a]);
  }
}

/**
 * Standard floating point instruction: xxxx fD,fA,fC,fB
 *
 * @param {u32} inVal
 * @param {string} name
 * @param {int} mask
 * @param {int} dmode
 */
function fdabc(inVal, name, mask, dmode) {
  let err = 0;

  m_flags |= dmode;
  // m_opcode = fmt::format("f{}{}", name, rcsel[in & 1]);
  m_opcode = sprintf('f%s%s', name, rcsel[inVal & 1]);
  // m_operands += fmt::format("f{},", PPCGETD(inVal));
  m_operands += sprintf('f%s,', PPCGETD(inVal));

  if (mask & 4) {
    // m_operands += fmt::format("f{},", PPCGETA(inVal));
    m_operands += sprintf('f%s,', PPCGETA(inVal));
  } else if ((mask & 8) == 0) {
    err |= PPCGETA(inVal);
  }

  if (mask & 2) {
    // m_operands += fmt::format("f{},", PPCGETC(inVal));
    m_operands += sprintf('f%s,', PPCGETC(inVal));
  } else if (PPCGETC(inVal) && (mask & 8) == 0) {
    err |= PPCGETC(inVal);
  }

  if (mask & 1) {
    // m_operands += fmt::format("f{},", PPCGETB(in));
    m_operands += sprintf('f%s,', PPCGETB(inVal));
  } else if (!(mask & 8)) {
    err |= PPCGETB(inVal);
  }

  // Drop the trailing comma
  m_operands = m_operands.slice(0, -1);

  if (err) {
    ill(inVal);
  }
}

/**
 * @param {u32} inVal
 */
function fmr(inVal) {
  // m_opcode = fmt::format("fmr{}", rcsel[inVal & 1]);
  m_opcode = sprintf('fmr%s', rcsel[inVal & 1]);
  // m_operands = fmt::format("f{}, f{}", PPCGETD(inVal), PPCGETB(inVal));
  m_operands = sprintf('f%s, f%s', PPCGETD(inVal), PPCGETB(inVal));
}

/**
 * Indexed float instruction: xxxx fD,rA,rB
 *
 * @param {u32} inVal
 * @param {string} name
 * @param {int} mask
 */
function fdab(inVal, name, mask) {
  m_opcode = name;
  m_operands = fd_ra_rb(inVal, mask);
}

/**
 * @param {u32} inVal
 * @param {char} c
 */
function fcmp(inVal, c) {
  if (inVal & 0x00600001) {
    ill(inVal);
  } else {
    // m_opcode = fmt::format("fcmp{}", c);
    m_opcode = sprintf('fcmp%s', c);
    // m_operands = fmt::format("cr{},f{},f{}", PPCGETCRD(inVal), PPCGETA(inVal), PPCGETB(inVal));
    m_operands = sprintf(
      'cr%s,f%s,f%s',
      PPCGETCRD(inVal),
      PPCGETA(inVal),
      PPCGETB(inVal)
    );
  }
}

/**
 * @param {u32} inVal
 * @param {int} n
 */
function mtfsb(inVal, n) {
  if (inVal & (PPCAMASK | PPCBMASK)) {
    ill(inVal);
  } else {
    // m_opcode = fmt::format("mtfsb{}{}", n, rcsel[inVal & 1]);
    m_opcode = sprintf('mtfsb%s%s', n, rcsel[inVal & 1]);
    // m_operands = std::to_string(PPCGETD(inVal));
    m_operands = String(PPCGETD(inVal));
  }
}

// Paired instructions

let pairedInstInput = 0;

function pairedInst(shiftAmt, mask) {
  return function () {
    return (pairedInstInput >>> shiftAmt) & mask;
  };
}

const RA = pairedInst(16, 0x1f);
const RB = pairedInst(11, 0x1f);
const RC = pairedInst(6, 0x1f);
const RD = pairedInst(21, 0x1f);
const RS = pairedInst(21, 0x1f);
const FA = pairedInst(16, 0x1f);
const FB = pairedInst(11, 0x1f);
const FC = pairedInst(6, 0x1f);
const FD = pairedInst(21, 0x1f);
const FS = pairedInst(21, 0x1f);
const IMM = pairedInst(0, 0xffff);
const UIMM = pairedInst(0, 0xffff);
const OFS = pairedInst(0, 0xffff);
const OPCD = pairedInst(26, 0x3f);
const XO_10 = pairedInst(1, 0x3ff);
const XO_9 = pairedInst(1, 0x1ff);
const XO_5 = pairedInst(1, 0x1f);
const Rc = pairedInst(0, 1);
const SH = pairedInst(11, 0x1f);
const MB = pairedInst(6, 0x1f);
const ME = pairedInst(1, 0x1f);
const OE = pairedInst(10, 1);
const TO = pairedInst(21, 0x1f);
const CRFD = pairedInst(23, 0x7);
const CRFS = pairedInst(18, 0x7);
const CRBD = pairedInst(21, 0x1f);
const CRBA = pairedInst(16, 0x1f);
const CRBB = pairedInst(11, 0x1f);
const L = pairedInst(21, 1);
const NB = pairedInst(11, 0x1f);
const AA = pairedInst(1, 1);
const LK = pairedInst(0, 1);
const LI = pairedInst(2, 0xffffff);
const BO = pairedInst(21, 0x1f);
const BI = pairedInst(16, 0x1f);
const BD = pairedInst(2, 0x3fff);

const MTFSFI_IMM = pairedInst(12, 0xf);
const FM = pairedInst(17, 0xff);
const SR = pairedInst(16, 0xf);
const SPR = pairedInst(11, 0x3ff);
const TBR = pairedInst(11, 0x3ff);
const CRM = pairedInst(12, 0xff);

const I = pairedInst(12, 0x7);
const W = pairedInst(15, 0x1);
const IX = pairedInst(7, 0x7);
const WX = pairedInst(10, 0x1);

/**
 * @param {u32} inst
 */
function ps(inst) {
  pairedInstInput = inst;

  switch ((inst >> 1) & 0x1f) {
    case 6:
      m_opcode = inst & 0x40 ? 'psq_lux' : 'psq_lx';
      // m_operands = fmt::format("p{}, (r{} + r{}), {}, qr{}", FD, RA, RB, WX, IX);
      m_operands = sprintf(
        'p%s, (r%s + r%s), %s, qr%s',
        FD(),
        RA(),
        RB(),
        WX(),
        IX()
      );
      return;
    case 7:
      m_opcode = inst & 0x40 ? 'psq_stux' : 'psq_stx';
      // m_operands = fmt::format("p{}, r{}, r{}, {}, qr{}", FS, RA, RB, WX, IX);
      m_operands = sprintf(
        'p%s, r%s, r%s, %s, qr%s',
        FS(),
        RA(),
        RB(),
        WX(),
        IX()
      );
      return;
    case 18:
      m_opcode = 'ps_div';
      // m_operands = fmt::format("p{}, p{}/p{}", FD, FA, FB);
      m_operands = sprintf('p%s, p%s/p%s', FD(), FA(), FB());
      return;
    case 20:
      m_opcode = 'ps_sub';
      // m_operands = fmt::format("p{}, p{}-p{}", FD, FA, FB);
      m_operands = sprintf('p%s, p%s-p%s', FD(), FA(), FB());
      return;
    case 21:
      m_opcode = 'ps_add';
      // m_operands = fmt::format("p{}, p{}+p{}", FD, FA, FB);
      m_operands = sprintf('p%s, p%s+p%s', FD(), FA(), FB());
      return;
    case 23:
      m_opcode = 'ps_sel';
      // m_operands = fmt::format("p{}>=0?p{}:p{}", FD, FA, FC);
      m_operands = sprintf('p%s>=0?p%s:p%s', FD(), FA(), FC());
      return;
    case 24:
      m_opcode = 'ps_res';
      // m_operands = fmt::format("p{}, (1/p{})", FD, FB);
      m_operands = sprintf('p%s, (1/p%s)', FD(), FB());
      return;
    case 25:
      m_opcode = 'ps_mul';
      // m_operands = fmt::format("p{}, p{}*p{}", FD, FA, FC);
      m_operands = sprintf('p%s, p%s*p%s', FD(), FA(), FC());
      return;
    case 26: // rsqrte
      m_opcode = 'ps_rsqrte';
      // m_operands = fmt::format("p{}, p{}", FD, FB);
      m_operands = sprintf('p%s, p%s', FD(), FB());
      return;
    case 28: // msub
      m_opcode = 'ps_msub';
      // m_operands = fmt::format("p{}, p{}*p{}-p{}", FD, FA, FC, FB);
      m_operands = sprintf('p%s, p%s*p%s-p%s', FD(), FA(), FC(), FB());
      return;
    case 29: // madd
      m_opcode = 'ps_madd';
      // m_operands = fmt::format("p{}, p{}*p{}+p{}", FD, FA, FC, FB);
      m_operands = sprintf('p%s, p%s*p%s+p%s', FD(), FA(), FC(), FB());
      return;
    case 30: // nmsub
      m_opcode = 'ps_nmsub';
      // m_operands = fmt::format("p{}, -(p{}*p{}-p{})", FD, FA, FC, FB);
      m_operands = sprintf('p%s, -(p%s*p%s-p%s)', FD(), FA(), FC(), FB());
      return;
    case 31: // nmadd
      m_opcode = 'ps_nmadd';
      // m_operands = fmt::format("p{}, -(p{}*p{}+p{})", FD, FA, FC, FB);
      m_operands = sprintf('p%s, -(p%s*p%s+p%s)', FD(), FA(), FC(), FB());
      return;
    case 10:
      m_opcode = 'ps_sum0';
      // m_operands = fmt::format("p{}, 0=p{}+p{}, 1=p{}", FD, FA, FB, FC);
      m_operands = sprintf('p%s, 0=p%s+p%s, 1=p%s', FD(), FA(), FB(), FC());
      return;
    case 11:
      m_opcode = 'ps_sum1';
      // m_operands = fmt::format("p{}, 0=p{}, 1=p{}+p{}", FD, FC, FA, FB);
      m_operands = sprintf('p%s, 0=p%s, 1=p%s+p%s', FD(), FC(), FA(), FB());
      return;
    case 12:
      m_opcode = 'ps_muls0';
      // m_operands = fmt::format("p{}, p{}*p{}[0]", FD, FA, FC);
      m_operands = sprintf('p%s, p%s*p%s[0]', FD(), FA(), FC());
      return;
    case 13:
      m_opcode = 'ps_muls1';
      // m_operands = fmt::format("p{}, p{}*p{}[1]", FD, FA, FC);
      m_operands = sprintf('p%s, p%s*p%s[1]', FD(), FA(), FC());
      return;
    case 14:
      m_opcode = 'ps_madds0';
      // m_operands = fmt::format("p{}, p{}*p{}[0]+p{}", FD, FA, FC, FB);
      m_operands = sprintf('p%s, p%s*p%s[0]+p%s', FD(), FA(), FC(), FB());
      return;
    case 15:
      m_opcode = 'ps_madds1';
      // m_operands = fmt::format("p{}, p{}*p{}[1]+p{}", FD, FA, FC, FB);
      m_operands = sprintf('p%s, p%s*p%s[1]+p%s', FD(), FA(), FC(), FB());
      return;
  }

  switch ((inst >> 1) & 0x3ff) {
    // 10-bit suckers  (?)
    case 40: // nmadd
      m_opcode = 'ps_neg';
      // m_operands = fmt::format("p{}, -p{}", FD, FB);
      m_operands = sprintf('p%s, -p%s', FD(), FB());
      return;
    case 72: // nmadd
      m_opcode = 'ps_mr';
      // m_operands = fmt::format("p{}, p{}", FD, FB);
      m_operands = sprintf('p%s, p%s', FD(), FB());
      return;
    case 136:
      m_opcode = 'ps_nabs';
      // m_operands = fmt::format("p{}, -|p{}|", FD, FB);
      m_operands = sprintf('p%s, -|p%s|', FD(), FB());
      return;
    case 264:
      m_opcode = 'ps_abs';
      // m_operands = fmt::format("p{}, |p{}|", FD, FB);
      m_operands = sprintf('p%s, |p%s|', FD(), FB());
      return;
    case 0:
    case 32:
    case 64:
    case 96: {
      m_opcode = ps_cmpname[(inst >> 6) & 0x3];

      let i = PPCGETCRD(inst);
      if (i != 0) {
        // m_operands += fmt::format("cr{}, ", i);
        m_operands += sprintf('cr%s, ', i);
      }
      // m_operands += fmt::format("p{}, p{}", FA, FB);
      m_operands += sprintf('p%s, p%s', FA(), FB());
      return;
    }
    case 528:
      m_opcode = 'ps_merge00';
      // m_operands = fmt::format("p{}, p{}[0],p{}[0]", FD, FA, FB);
      m_operands = sprintf('p%s, p%s[0],p%s[0]', FD(), FA(), FB());
      return;
    case 560:
      m_opcode = 'ps_merge01';
      // m_operands = fmt::format("p{}, p{}[0],p{}[1]", FD, FA, FB);
      m_operands = sprintf('p%s, p%s[0],p%s[1]', FD(), FA(), FB());
      return;
    case 592:
      m_opcode = 'ps_merge10';
      // m_operands = fmt::format("p{}, p{}[1],p{}[0]", FD, FA, FB);
      m_operands = sprintf('p%s, p%s[1],p%s[0]', FD(), FA(), FB());
      return;
    case 624:
      m_opcode = 'ps_merge11';
      // m_operands = fmt::format("p{}, p{}[1],p{}[1]", FD, FA, FB);
      m_operands = sprintf('p%s, p%s[1],p%s[1]', FD(), FA(), FB());
      return;
    case 1014:
      if (inst & PPCDMASK) {
        ill(inst);
      } else {
        dab(inst, 'dcbz_l', 3, 0, 0, 0, 0);
      }
      return;
  }

  //	default:
  // m_opcode = fmt::format("ps_{}", ((inst >> 1) & 0x1f));
  m_opcode = sprintf('ps_%s', (inst >> 1) & 0x1f);
  m_operands = '---';
}

/**
 * @param {u32} inst
 */
function ps_mem(inst) {
  pairedInstInput = inst;

  switch (PPCGETIDX(inst)) {
    case 56:
      m_opcode = 'psq_l';
      // m_operands = fmt::format("p{}, {}(r{}), {}, qr{}", RS, SEX12(inst & 0xFFF), RA, W, I);
      m_operands = sprintf(
        'p%s, %s(r%s), %s, qr%s',
        RS(),
        SEX12(inst & 0xfff),
        RA(),
        W(),
        I()
      );
      break;
    case 57:
      m_opcode = 'psq_lu';
      // m_operands = fmt::format("p{}, {}(r{}), {}, qr{}", RS, SEX12(inst & 0xFFF), RA, W, I);
      m_operands = sprintf(
        'p%s, %s(r%s), %s, qr%s',
        RS(),
        SEX12(inst & 0xfff),
        RA(),
        W(),
        I()
      );
      break;
    case 60:
      m_opcode = 'psq_st';
      // m_operands = fmt::format("p{}, {}(r{}), {}, qr{}", RS, SEX12(inst & 0xFFF), RA, W, I);
      m_operands = sprintf(
        'p%s, %s(r%s), %s, qr%s',
        RS(),
        SEX12(inst & 0xfff),
        RA(),
        W(),
        I()
      );
      break;
    case 61:
      m_opcode = 'psq_stu';
      // m_operands = fmt::format("p{}, {}(r{}), {}, qr{}", RS, SEX12(inst & 0xFFF), RA, W, I);
      m_operands = sprintf(
        'p%s, %s(r%s), %s, qr%s',
        RS(),
        SEX12(inst & 0xfff),
        RA(),
        W(),
        I()
      );
      break;
  }
}

/**
 * @param {boolean} bigEndian
 */
function doDisassembly(bigEndian) {
  let inVal = m_instr;

  if (!bigEndian) {
    inVal =
      ((inVal & 0xff) << 24) |
      ((inVal & 0xff00) << 8) |
      ((inVal & 0xff0000) >> 8) |
      ((inVal & 0xff000000) >> 24);
  }

  m_opcode = '';
  m_operands = '';
  m_type = PPCINSTR.OTHER;
  m_flags = 0;

  switch (PPCGETIDX(inVal)) {
    case 2:
      trapi(inVal, PPCF.SIXTY_FOUR); // tdi
      break;
    case 3:
      trapi(inVal, 0); // twi
      break;
    case 4:
      ps(inVal);
      break;
    case 56:
    case 57:
    case 60:
    case 61:
      ps_mem(inVal);
      break;
    case 7:
      m_opcode = 'mulli';
      m_operands = imm(inVal, 0, 0, false);
      break;
    case 8:
      m_opcode = 'subfic';
      m_operands = imm(inVal, 0, 0, false);
      break;
    case 10:
      cmpi(inVal, 1); // cmpli
      break;
    case 11:
      cmpi(inVal, 0); // cmpi
      break;
    case 12:
      addi(inVal, 'ic'); // addic
      break;
    case 13:
      addi(inVal, 'ic.'); // addic.
      break;
    case 14:
      addi(inVal, 'i'); // addi
      break;
    case 15:
      addi(inVal, 'is'); // addis
      break;
    case 16:
      bc(inVal);
      break;
    case 17:
      if ((inVal & ~PPCIDXMASK) == 2) {
        m_opcode = 'sc';
      } else {
        ill(inVal);
      }
      break;
    case 18:
      bli(inVal);
      break;
    case 19:
      switch (PPCGETIDX2(inVal)) {
        case 0:
          mcrf(inVal, ''); // mcrf
          break;
        case 16:
          branch(inVal, 'lr', 0, 0); // bclr
          break;
        case 33:
          crop(inVal, 'nor', 'not'); // crnor
          break;
        case 50:
          nooper(inVal, 'rfi', PPCF.SUPER);
          break;
        case 129:
          crop(inVal, 'andc', {}); // crandc
          break;
        case 150:
          nooper(inVal, 'isync', 0);
          break;
        case 193:
          crop(inVal, 'xor', 'clr'); // crxor
          break;
        case 225:
          crop(inVal, 'nand', {}); // crnand
          break;
        case 257:
          crop(inVal, 'and', {}); // crand
          break;
        case 289:
          crop(inVal, 'eqv', 'set'); // creqv
          break;
        case 417:
          crop(inVal, 'orc', {}); // crorc
          break;
        case 449:
          crop(inVal, 'or', 'move'); // cror
          break;
        case 528:
          branch(inVal, 'ctr', 0, 0); // bcctr
          break;
        default:
          ill(inVal);
          break;
      }
      break;
    case 20:
      rlw(inVal, 'imi', 0); // rlwimi
      break;
    case 21:
      rlw(inVal, 'inm', 0); // rlwinm
      break;
    case 23:
      rlw(inVal, 'nm', 1); // rlwnm
      break;
    case 24:
      if (inVal & ~PPCIDXMASK) ori(inVal, 'ori');
      else m_opcode = 'nop';
      break;
    case 25:
      ori(inVal, 'oris');
      break;
    case 26:
      ori(inVal, 'xori');
      break;
    case 27:
      ori(inVal, 'xoris');
      break;
    case 28:
      ori(inVal, 'andi.');
      break;
    case 29:
      ori(inVal, 'andis.');
      break;
    case 30:
      switch ((inVal >> 2) & 0x7) {
        case 0:
          rld(inVal, 'icl', 0); // rldicl
          break;
        case 1:
          rld(inVal, 'icr', 0); // rldicr
          break;
        case 2:
          rld(inVal, 'ic', 0); // rldic
          break;
        case 3:
          rld(inVal, 'imi', 0); // rldimi
          break;
        case 4:
          rld(inVal, inVal & 2 ? 'cl' : 'cr', 1); // rldcl, rldcr
          break;
        default:
          ill(inVal);
          break;
      }
      break;
    case 31:
      switch (PPCGETIDX2(inVal)) {
        case 0:
        case 32:
          if (inVal & 1) ill(inVal);
          else cmp(inVal); // cmp, cmpl
          break;
        case 4:
          if (inVal & 1) ill(inVal);
          else trap(inVal, 0); // tw
          break;
        case 8:
        case (PPCOE >> 1) + 8:
          dab(swapab(inVal), 'subc', 7, 0, 1, -1, 0);
          break;
        case 9:
          dab(inVal, 'mulhdu', 7, 0, 0, -1, PPCF.SIXTY_FOUR);
          break;
        case 10:
        case (PPCOE >> 1) + 10:
          dab(inVal, 'addc', 7, 0, 1, -1, 0);
          break;
        case 11:
          dab(inVal, 'mulhwu', 7, 0, 0, -1, 0);
          break;
        case 19:
          if (inVal & (PPCAMASK | PPCBMASK)) {
            ill(inVal);
          } else {
            dab(inVal, 'mfcr', 4, 0, 0, 0, 0);
          }
          break;
        case 20:
          dab(inVal, 'lwarx', 7, 0, 0, 0, 0);
          break;
        case 21:
          dab(inVal, 'ldx', 7, 0, 0, 0, PPCF.SIXTY_FOUR);
          break;
        case 23:
          dab(inVal, 'lwzx', 7, 0, 0, 0, 0);
          break;
        case 24:
          dab(inVal, 'slw', 7, 1, 0, -1, 0);
          break;
        case 26:
          if (inVal & PPCBMASK) ill(inVal);
          else dab(inVal, 'cntlzw', 6, 1, 0, -1, 0);
          break;
        case 27:
          dab(inVal, 'sld', 7, 1, 0, -1, PPCF.SIXTY_FOUR);
          break;
        case 28:
          dab(inVal, 'and', 7, 1, 0, -1, 0);
          break;
        case 40:
        case (PPCOE >> 1) + 40:
          dab(swapab(inVal), 'sub', 7, 0, 1, -1, 0);
          break;
        case 53:
          dab(inVal, 'ldux', 7, 0, 0, 0, PPCF.SIXTY_FOUR);
          break;
        case 54:
          if (inVal & PPCDMASK) ill(inVal);
          else dab(inVal, 'dcbst', 3, 0, 0, 0, 0);
          break;
        case 55:
          dab(inVal, 'lwzux', 7, 0, 0, 0, 0);
          break;
        case 58:
          if (inVal & PPCBMASK) ill(inVal);
          else dab(inVal, 'cntlzd', 6, 1, 0, -1, PPCF.SIXTY_FOUR);
          break;
        case 60:
          dab(inVal, 'andc', 7, 1, 0, -1, 0);
          break;
        case 68:
          trap(inVal, PPCF.SIXTY_FOUR); // td
          break;
        case 73:
          dab(inVal, 'mulhd', 7, 0, 0, -1, PPCF.SIXTY_FOUR);
          break;
        case 75:
          dab(inVal, 'mulhw', 7, 0, 0, -1, 0);
          break;
        case 83:
          if (inVal & (PPCAMASK | PPCBMASK)) {
            ill(inVal);
          } else {
            dab(inVal, 'mfmsr', 4, 0, 0, 0, PPCF.SUPER);
          }
          break;
        case 84:
          dab(inVal, 'ldarx', 7, 0, 0, 0, PPCF.SIXTY_FOUR);
          break;
        case 86:
          if (inVal & PPCDMASK) ill(inVal);
          else dab(inVal, 'dcbf', 3, 0, 0, 0, 0);
          break;
        case 87:
          dab(inVal, 'lbzx', 7, 0, 0, 0, 0);
          break;
        case 104:
        case (PPCOE >> 1) + 104:
          if (inVal & PPCBMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'neg', 6, 0, 1, -1, 0);
          }
          break;
        case 119:
          dab(inVal, 'lbzux', 7, 0, 0, 0, 0);
          break;
        case 124:
          if (PPCGETD(inVal) == PPCGETB(inVal)) {
            dab(inVal, 'not', 6, 1, 0, -1, 0);
          } else {
            dab(inVal, 'nor', 7, 1, 0, -1, 0);
          }
          break;
        case 136:
        case (PPCOE >> 1) + 136:
          dab(inVal, 'subfe', 7, 0, 1, -1, 0);
          break;
        case 138:
        case (PPCOE >> 1) + 138:
          dab(inVal, 'adde', 7, 0, 1, -1, 0);
          break;
        case 144:
          mtcr(inVal);
          break;
        case 146:
          if (inVal & (PPCAMASK | PPCBMASK)) {
            ill(inVal);
          } else {
            dab(inVal, 'mtmsr', 4, 0, 0, 0, PPCF.SUPER);
          }
          break;
        case 149:
          dab(inVal, 'stdx', 7, 0, 0, 0, PPCF.SIXTY_FOUR);
          break;
        case 150:
          dab(inVal, 'stwcx.', 7, 0, 0, 1, 0);
          break;
        case 151:
          dab(inVal, 'stwx', 7, 0, 0, 0, 0);
          break;
        case 181:
          dab(inVal, 'stdux', 7, 0, 0, 0, PPCF.SIXTY_FOUR);
          break;
        case 183:
          dab(inVal, 'stwux', 7, 0, 0, 0, 0);
          break;
        case 200:
        case (PPCOE >> 1) + 200:
          if (inVal & PPCBMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'subfze', 6, 0, 1, -1, 0);
          }
          break;
        case 202:
        case (PPCOE >> 1) + 202:
          if (inVal & PPCBMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'addze', 6, 0, 1, -1, 0);
          }
          break;
        case 210:
          msr(inVal, 1); // mfsr
          break;
        case 214:
          dab(inVal, 'stdcx.', 7, 0, 0, 1, PPCF.SIXTY_FOUR);
          break;
        case 215:
          dab(inVal, 'stbx', 7, 0, 0, 0, 0);
          break;
        case 232:
        case (PPCOE >> 1) + 232:
          if (inVal & PPCBMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'subfme', 6, 0, 1, -1, 0);
          }
          break;
        case 233:
        case (PPCOE >> 1) + 233:
          dab(inVal, 'mulld', 7, 0, 1, -1, PPCF.SIXTY_FOUR);
          break;
        case 234:
        case (PPCOE >> 1) + 234:
          if (inVal & PPCBMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'addme', 6, 0, 1, -1, 0);
          }
          break;
        case 235:
        case (PPCOE >> 1) + 235:
          dab(inVal, 'mullw', 7, 0, 1, -1, 0);
          break;
        case 242:
          if (inVal & PPCAMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'mtsrin', 5, 0, 0, 0, PPCF.SUPER);
          }
          break;
        case 246:
          if (inVal & PPCDMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'dcbtst', 3, 0, 0, 0, 0);
          }
          break;
        case 247:
          dab(inVal, 'stbux', 7, 0, 0, 0, 0);
          break;
        case 266:
        case (PPCOE >> 1) + 266:
          dab(inVal, 'add', 7, 0, 1, -1, 0);
          break;
        case 278:
          if (inVal & PPCDMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'dcbt', 3, 0, 0, 0, 0);
          }
          break;
        case 279:
          dab(inVal, 'lhzx', 7, 0, 0, 0, 0);
          break;
        case 284:
          dab(inVal, 'eqv', 7, 1, 0, -1, 0);
          break;
        case 306:
          if (inVal & (PPCDMASK | PPCAMASK)) {
            ill(inVal);
          } else {
            dab(inVal, 'tlbie', 1, 0, 0, 0, PPCF.SUPER);
          }
          break;
        case 310:
          dab(inVal, 'eciwx', 7, 0, 0, 0, 0);
          break;
        case 311:
          dab(inVal, 'lhzux', 7, 0, 0, 0, 0);
          break;
        case 316:
          dab(inVal, 'xor', 7, 1, 0, -1, 0);
          break;
        case 339:
          mspr(inVal, 0); // mfspr
          break;
        case 341:
          dab(inVal, 'lwax', 7, 0, 0, 0, PPCF.SIXTY_FOUR);
          break;
        case 343:
          dab(inVal, 'lhax', 7, 0, 0, 0, 0);
          break;
        case 370:
          nooper(inVal, 'tlbia', PPCF.SUPER);
          break;
        case 371:
          mtb(inVal); // mftb
          break;
        case 373:
          dab(inVal, 'lwaux', 7, 0, 0, 0, PPCF.SIXTY_FOUR);
          break;
        case 375:
          dab(inVal, 'lhaux', 7, 0, 0, 0, 0);
          break;
        case 407:
          dab(inVal, 'sthx', 7, 0, 0, 0, 0);
          break;
        case 412:
          dab(inVal, 'orc', 7, 1, 0, -1, 0);
          break;
        case 413:
          sradi(inVal); // sradi
          break;
        case 434:
          if (inVal & (PPCDMASK | PPCAMASK)) {
            ill(inVal);
          } else {
            dab(inVal, 'slbie', 1, 0, 0, 0, PPCF.SUPER | PPCF.SIXTY_FOUR);
          }
          break;
        case 438:
          dab(inVal, 'ecowx', 7, 0, 0, 0, 0);
          break;
        case 439:
          dab(inVal, 'sthux', 7, 0, 0, 0, 0);
          break;
        case 444:
          if (PPCGETD(inVal) == PPCGETB(inVal)) {
            dab(inVal, 'mr', 6, 1, 0, -1, 0);
          } else {
            dab(inVal, 'or', 7, 1, 0, -1, 0);
          }
          break;
        case 457:
        case (PPCOE >> 1) + 457:
          dab(inVal, 'divdu', 7, 0, 1, -1, PPCF.SIXTY_FOUR);
          break;
        case 459:
        case (PPCOE >> 1) + 459:
          dab(inVal, 'divwu', 7, 0, 1, -1, 0);
          break;
        case 467:
          mspr(inVal, 1); // mtspr
          break;
        case 470:
          if (inVal & PPCDMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'dcbi', 3, 0, 0, 0, 0);
          }
          break;
        case 476:
          dab(inVal, 'nand', 7, 1, 0, -1, 0);
          break;
        case 489:
        case (PPCOE >> 1) + 489:
          dab(inVal, 'divd', 7, 0, 1, -1, PPCF.SIXTY_FOUR);
          break;
        case 491:
        case (PPCOE >> 1) + 491:
          dab(inVal, 'divw', 7, 0, 1, -1, 0);
          break;
        case 498:
          nooper(inVal, 'slbia', PPCF.SUPER | PPCF.SIXTY_FOUR);
          break;
        case 512:
          if (inVal & 0x007ff801) {
            ill(inVal);
          } else {
            m_opcode = 'mcrxr';
            // m_operands = fmt::format("cr{}", PPCGETCRD(inVal));
            m_operands = sprintf('cr%s', PPCGETCRD(inVal));
          }
          break;
        case 533:
          dab(inVal, 'lswx', 7, 0, 0, 0, 0);
          break;
        case 534:
          dab(inVal, 'lwbrx', 7, 0, 0, 0, 0);
          break;
        case 535:
          fdab(inVal, 'lfsx', 7);
          break;
        case 536:
          dab(inVal, 'srw', 7, 1, 0, -1, 0);
          break;
        case 539:
          dab(inVal, 'srd', 7, 1, 0, -1, PPCF.SIXTY_FOUR);
          break;
        case 566:
          nooper(inVal, 'tlbsync', PPCF.SUPER);
          break;
        case 567:
          fdab(inVal, 'lfsux', 7);
          break;
        case 595:
          msr(inVal, 0); // mfsr
          break;
        case 597:
          rrn(inVal, 'lswi', 0, 0, 0, 0);
          break;
        case 598:
          nooper(inVal, 'sync', PPCF.SUPER);
          break;
        case 599:
          fdab(inVal, 'lfdx', 7);
          break;
        case 631:
          fdab(inVal, 'lfdux', 7);
          break;
        case 659:
          if (inVal & PPCAMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'mfsrin', 5, 0, 0, 0, PPCF.SUPER);
          }
          break;
        case 661:
          dab(inVal, 'stswx', 7, 0, 0, 0, 0);
          break;
        case 662:
          dab(inVal, 'stwbrx', 7, 0, 0, 0, 0);
          break;
        case 663:
          fdab(inVal, 'stfsx', 7);
          break;
        case 695:
          fdab(inVal, 'stfsux', 7);
          break;
        case 725:
          rrn(inVal, 'stswi', 0, 0, 0, 0);
          break;
        case 727:
          fdab(inVal, 'stfdx', 7);
          break;
        case 759:
          fdab(inVal, 'stfdux', 7);
          break;
        case 790:
          dab(inVal, 'lhbrx', 7, 0, 0, 0, 0);
          break;
        case 792:
          dab(inVal, 'sraw', 7, 1, 0, -1, 0);
          break;
        case 794:
          dab(inVal, 'srad', 7, 1, 0, -1, PPCF.SIXTY_FOUR);
          break;
        case 824:
          rrn(inVal, 'srawi', 1, 0, -1, 0);
          break;
        case 854:
          nooper(inVal, 'eieio', PPCF.SUPER);
          break;
        case 918:
          dab(inVal, 'sthbrx', 7, 0, 0, 0, 0);
          break;
        case 922:
          if (inVal & PPCBMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'extsh', 6, 1, 0, -1, 0);
          }
          break;
        case 954:
          if (inVal & PPCBMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'extsb', 6, 1, 0, -1, 0);
          }
          break;
        case 982:
          if (inVal & PPCDMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'icbi', 3, 0, 0, 0, 0);
          }
          break;
        case 983:
          fdab(inVal, 'stfiwx', 7);
          break;
        case 986:
          if (inVal & PPCBMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'extsw', 6, 1, 0, -1, PPCF.SIXTY_FOUR);
          }
          break;
        case 1014:
          if (inVal & PPCDMASK) {
            ill(inVal);
          } else {
            dab(inVal, 'dcbz', 3, 0, 0, 0, 0);
          }
          break;
        default:
          ill(inVal);
          break;
      }
      break;
    case 32:
    case 33:
    case 34:
    case 35:
    case 36:
    case 37:
    case 38:
    case 39:
    case 40:
    case 41:
    case 42:
    case 43:
    case 44:
    case 45:
    case 46:
    case 47:
      ldst(inVal, ldstnames[PPCGETIDX(inVal) - 32], 'r', 0);
      break;
    case 48:
    case 49:
    case 50:
    case 51:
    case 52:
    case 53:
    case 54:
    case 55:
      ldst(inVal, ldstnames[PPCGETIDX(inVal) - 32], 'f', 0);
      break;
    case 58:
      switch (inVal & 3) {
        case 0:
          ldst(inVal & ~3, 'ld', 'r', PPCF.SIXTY_FOUR);
          break;
        case 1:
          ldst(inVal & ~3, 'ldu', 'r', PPCF.SIXTY_FOUR);
          break;
        case 2:
          ldst(inVal & ~3, 'lwa', 'r', PPCF.SIXTY_FOUR);
          break;
        default:
          ill(inVal);
          break;
      }
      break;
    case 59:
      switch (inVal & 0x3e) {
        case 36:
          fdabc(inVal, 'divs', 5, 0);
          break;
        case 40:
          fdabc(inVal, 'subs', 5, 0);
          break;
        case 42:
          fdabc(inVal, 'adds', 5, 0);
          break;
        case 44:
          fdabc(inVal, 'sqrts', 1, 0);
          break;
        case 48:
          fdabc(inVal, 'res', 1, 0);
          break;
        case 50:
          fdabc(inVal, 'muls', 6, 0);
          break;
        case 56:
          fdabc(inVal, 'msubs', 7, 0);
          break;
        case 58:
          fdabc(inVal, 'madds', 7, 0);
          break;
        case 60:
          fdabc(inVal, 'nmsubs', 7, 0);
          break;
        case 62:
          fdabc(inVal, 'nmadds', 7, 0);
          break;
        default:
          ill(inVal);
          break;
      }
      break;
    case 62:
      switch (inVal & 3) {
        case 0:
          ldst(inVal & ~3, 'std', 'r', PPCF.SIXTY_FOUR);
          break;
        case 1:
          ldst(inVal & ~3, 'stdu', 'r', PPCF.SIXTY_FOUR);
          break;
        default:
          ill(inVal);
          break;
      }
      break;
    case 63:
      if (inVal & 32) {
        switch (inVal & 0x1e) {
          case 4:
            fdabc(inVal, 'div', 5, 0);
            break;
          case 8:
            fdabc(inVal, 'sub', 5, 0);
            break;
          case 10:
            fdabc(inVal, 'add', 5, 0);
            break;
          case 12:
            fdabc(inVal, 'sqrt', 1, 0);
            break;
          case 14:
            fdabc(inVal, 'sel', 7, 0);
            break;
          case 18:
            fdabc(inVal, 'mul', 6, 0);
            break;
          case 20:
            fdabc(inVal, 'rsqrte', 1, 0);
            break;
          case 24:
            fdabc(inVal, 'msub', 7, 0);
            break;
          case 26:
            fdabc(inVal, 'madd', 7, 0);
            break;
          case 28:
            fdabc(inVal, 'nmsub', 7, 0);
            break;
          case 30:
            fdabc(inVal, 'nmadd', 7, 0);
            break;
          default:
            ill(inVal);
            break;
        }
      } else {
        switch (PPCGETIDX2(inVal)) {
          case 0:
            fcmp(inVal, 'u');
            break;
          case 12:
            fdabc(inVal, 'rsp', 1, 0);
            break;
          case 14:
            fdabc(inVal, 'ctiw', 1, 0);
            break;
          case 15:
            fdabc(inVal, 'ctiwz', 1, 0);
            break;
          case 32:
            fcmp(inVal, 'o');
            break;
          case 38:
            mtfsb(inVal, 1);
            break;
          case 40:
            fdabc(inVal, 'neg', 9, 0);
            break;
          case 64:
            mcrf(inVal, 's'); // mcrfs
            break;
          case 70:
            mtfsb(inVal, 0);
            break;
          case 72:
            fmr(inVal);
            break;
          case 134:
            if ((inVal & 0x006f0800) == 0) {
              // m_opcode = fmt::format("mtfsfi{}", rcsel[in & 1]);
              m_opcode = sprintf('mtfsfi%s', rcsel[inVal & 1]);
              // m_operands = fmt::format("cr{},{}", PPCGETCRD(inVal), (inVal & 0xf000) >> 12);
              m_operands = sprintf(
                'cr%s,%s',
                PPCGETCRD(inVal),
                (inVal & 0xf000) >> 12
              );
            } else {
              ill(inVal);
            }
            break;
          case 136:
            fdabc(inVal, 'nabs', 9, 0);
            break;
          case 264:
            fdabc(inVal, 'abs', 9, 0);
            break;
          case 583:
            if (inVal & (PPCAMASK | PPCBMASK)) ill(inVal);
            else dab(inVal, 'mffs', 4, 0, 0, -1, 0);
            break;
          case 711:
            if ((inVal & 0x02010000) == 0) {
              // m_opcode = fmt::format("mtfsf{}", rcsel[in & 1]);
              m_opcode = sprintf('mtfsf%s', rcsel[inVal & 1]);
              // m_operands = fmt::format("0x{:x}, f{}", (inVal >> 17) & 0xff, PPCGETB(inVal));
              // m_operands = fmt::format("0x{:x}, f{}", (inVal >> 17) & 0xff, PPCGETB(inVal));
              m_operands = sprintf(
                '0x%x, f%s',
                (inVal >> 17) & 0xff,
                PPCGETB(inVal)
              );
            } else {
              ill(inVal);
            }
            break;
          case 814:
            fdabc(inVal, 'fctid', 9, PPCF.SIXTY_FOUR);
            break;
          case 815:
            fdabc(inVal, 'fctidz', 9, PPCF.SIXTY_FOUR);
            break;
          case 846:
            fdabc(inVal, 'fcfid', 9, PPCF.SIXTY_FOUR);
            break;
          default:
            ill(inVal);
            break;
        }
      }
      break;
    default:
      ill(inVal);
      break;
  }
  return m_instr + 1;
}

function disassemble(opcode, instrAddr, bigEndian = true) {
  m_instr = opcode;
  m_iaddr = instrAddr;

  doDisassembly(bigEndian);

  return `${m_opcode}\t${m_operands}`;
}

// prettier-ignore
const gpr_names = [ 
  " r0", " r1 (sp)", " r2 (rtoc)", " r3", " r4", " r5", " r6", " r7", " r8", " r9", "r10",
  "r11", "r12",      "r13",        "r14", "r15", "r16", "r17", "r18", "r19", "r20", "r21",
  "r22", "r23",      "r24",        "r25", "r26", "r27", "r28", "r29", "r30", "r31",
];

// const char* GekkoDisassembler::GetGPRName(u32 index)

/**
 * @param {number} index Index of gpr
 * @returns {string} Name of gpr
 */
function getGprName(index) {
  if (index < gpr_names.length) {
    return gpr_names[index];
  }
  return null;
}

// prettier-ignore
const fpr_names = [
  " f0", " f1", " f2", " f3", " f4", " f5", " f6", " f7", " f8", " f9", "f10",
  "f11", "f12", "f13", "f14", "f15", "f16", "f17", "f18", "f19", "f20", "f21",
  "f22", "f23", "f24", "f25", "f26", "f27", "f28", "f29", "f30", "f31",
];

/**
 * @param {number} index Index of fpr
 * @returns {string} Name of fpr
 */
function getFprName(index) {
  if (index < fpr_names.size()) {
    return fpr_names[index];
  }
  return null;
}

module.exports = {
  disassemble,
  getGprName,
  getFprName,
};
