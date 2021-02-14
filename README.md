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

You will need a package manager like `npm` or [Yarn](https://classic.yarnpkg.com/en/docs/install/) to install dependencies.<br>
_(`npm` is recommended for most users since it comes with the Node installer.
Use Yarn 1 if you plan to contribute to the project)_

To install dependencies, execute one of the following in this directory:

### npm

```sh
npm install
```

### Yarn

```sh
yarn
```

This will install dependencies, and you will only need to do this once.

### Add Map Files

- In this directory, create a new directory named `map`.
- Create a subdirectory of `map` named `gc.us`.<br>
  _(US Gamecube is the only supported version currently. Can add support for others if there is demand)_
- Copy the files from the `/map/Final/Release` directory of the game's content, and paste them in the `/map/gc.us` directory which you created in a previous instruction.

```
tp-rel-disassembler
├── dump
├── map
│   └── gc.us
│       ├── d_a_alldie.map
│       ├── d_a_andsw.map
│       ├── ...many more...
│       ├── d_a_ykgr.map
│       ├── f_pc_profile_lst.map
│       └── frameworkF.map
├── node_modules
├── output
├── src
├── .gitignore
├── index.js
├── LICENSE
├── package.json
└── README.md
```

The tool is now be ready to use.

_(Note: you can create a directory named `dump` as seen above to store your RAM dumps (or anything else you want))_

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
  - Leading 'd_a\_' is optional.
- Approximate Name (zant, lv5)
  - If the name you type is not an exact match, the tool will suggest a few options and exit.
