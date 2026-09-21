"""Kilagen — the reusable framework layer of a Git-native security program.

An instance never carries these files: it installs this package and adds its
own ``program/`` layer. See ``instantiation.md``.
"""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("kilagen")
except PackageNotFoundError:
    # Imported straight from a source tree with nothing installed. Anything
    # that records a version (the instance manifest) must fail loudly rather
    # than write this placeholder.
    __version__ = "0+unknown"

# The content contract this framework speaks. A program records how far it has
# been migrated in program/config.yml; the two must agree. Only ever raised in
# a major release, and only when the contract actually changes.
SCHEMA_VERSION = 3

__all__ = ["SCHEMA_VERSION", "__version__"]
