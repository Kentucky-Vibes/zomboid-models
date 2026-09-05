# Security

## Reporting a vulnerability

Report security problems privately through GitHub's vulnerability reporting for this repository: open the Security tab of [kentucky-vibes/zomboid-models](https://github.com/kentucky-vibes/zomboid-models/security) and choose "Report a vulnerability". Do not open a public issue for them.

Expect an acknowledgement within a week. Fixes ship as a patch release of the affected packages, with the report credited unless you ask otherwise.

## What counts

The packages run in three places, and each has its own concerns:

- The viewer runs in the browser and fetches JSON, glTF, and PNG files from the asset folder it is given. A document is data; it never runs code. A problem would be a document or an asset file that makes the viewer do something other than draw, such as reading from another origin.
- The pipeline and the render package run in Node.js on files from a game install and on documents from disk. A problem would be a crafted game file, mod file, or document that escapes the output folder or the asset folder, or runs code.
- The exporter mod runs inside the game and writes JSON files under the game's Lua folder. A problem would be a player name or item that breaks out of that folder or corrupts the index.

Reports about the game itself or about mods go to their authors.

## Supported versions

Only the latest minor release of each package receives security fixes.
