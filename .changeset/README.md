# Changesets

This folder holds pending release notes. Run `npm run changeset` after a user-facing change, pick the packages it touches and the bump type, and commit the generated file together with the code. The release workflow turns pending changesets into a version pull request, and publishes to npm when that pull request is merged.

The four public packages are versioned in lockstep, so a bump to one of them bumps all of them.
