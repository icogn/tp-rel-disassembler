# TP REL Disassembler

Pull REL instructions from Twilight Princess RAM dumps.

## Quick Overview

```sh
$ node index.js -i ./dump/mem1.raw -r midna
Determining REL ...
Disassembling d_a_midna ...

Created file:

  output/gc.us/d_a_midna-disassembled.txt
```

The created file will contain the assembly instructions of the REL.
Instructions are split by function, and human-readable labels are included for convenience.

## Get Started

You will need to have [Node](https://nodejs.org/en/download/) available on your local machine.
The latest LTS version is recommended.

You will need a package manager like `npm` or [Yarn](https://classic.yarnpkg.com/en/docs/install/) to fetch dependencies.<br>
_(`npm` is recommended for most users since it comes with the Node installer.
Use Yarn 1 if you plan to contribute to the project)_

To install dependencies, choose one of the following methods:

### npm

```sh
npm install
```

### Yarn

```sh
yarn
```

Once dependencies are installed, the tool is ready for use.

## Usage

```sh
node index.js -i [RAM_DUMP] -r [REL_IDENTIFIER]
```

### Options

`-i` or `--input` RAM Dump input file

`-r` or `--rel-id` REL Identifier which can be one of the following:

- Hex ID of REL (3a, 0x96, 47)
  - A numerical value is always interpreted as a Hex ID.
- Name (d_a_midna, e_rd)
  - A leading 'd_a\_' is optional.
- Approximate Name (zant, lv5)
  - If the name you type is not an exact match, the tool will suggest a few options and exit.
