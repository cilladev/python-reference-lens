# Changelog

All notable changes to the "Python Reference Lens" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-12-29

### Changed
- CodeLens now completely hides when there are zero references (instead of showing empty space)
- Default minimum references to show changed from 0 to 1
- Skip codelens for __init__ method

### Fixed
- Fixed visual spacing issue where CodeLens with no references would still take up space in the editor

## [1.0.0] - 2025-12-25

### Added
- Initial release