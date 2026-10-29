# TTRPG

A tabletop role-playing plugin that doubles as the showcase of the page-side plugin API: fenced blocks, a block for
pages, commands, a status cell, an editor menu row and settings — with no helper and no network, only files and
JavaScript.

## What it adds

- **```` ```statblock ````** fences: a creature's card from `key: value` lines (`name`, `ac`, `hp`…), drawn in the
  app's colours.
- **```` ```roll ````** fences: one button per line (`attack: d20+4`), each rolling its dice.
- **The block `ttrpg.initiative`**: the characters by their `initiative` property.
- **Commands**: **TTRPG: roll…** (type `2d6+3`, `d20`, `4d8-1`) and **TTRPG: new session note** (in the sessions
  folder).
- **A status cell** with the last roll; a click rolls the default die.
- **Editor menu**: "Roll <selection>" when the selection is a dice expression.

## Settings

- **Folder for session notes** (`campaigns/sessions`).
- **The die rolled when none is named** (d20, d6, d100).
- **Show every roll as a notification** (on).

## How it fits

No requirements. Meant to be read and copied: it uses most of what a plugin's page side can do.

## Platforms

Linux works; Android works (`phone = true`); the others are untested.

## Status

An example (`plugins/examples/`): the page side of the API shown off, meant to be copied. No tests.
